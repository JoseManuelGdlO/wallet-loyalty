import { HttpStatus, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { stampView, type WalletSyncState } from "@intelekia/shared";
import { assertBusinessAccess, hiddenIfForeign, isStaff, scopeFor, type AuthUser } from "../common/access";
import { encryptSecret, generateOpaqueToken, hashToken } from "../common/crypto.util";
import { DomainException } from "../common/domain.exception";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { WalletSyncService } from "../wallet/wallet-sync.service";
import { presentCard } from "./card-view";
import { evaluateStamp, startOfZonedDay } from "./stamp-policy";

type WalletReport = {
  apple: { status: WalletSyncState; detail: string };
  google: { status: WalletSyncState; detail: string };
};

const replayWallet: WalletReport = {
  apple: { status: "not_issued", detail: "La operación ya estaba registrada" },
  google: { status: "not_issued", detail: "La operación ya estaba registrada" },
};

@Injectable()
export class StampsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly wallet: WalletSyncService,
  ) {}

  async lookup(user: AuthUser, token: string) {
    if (!isStaff(user)) throw new DomainException(HttpStatus.FORBIDDEN, "FORBIDDEN", "No puedes consultar tarjetas");
    const card = await this.prisma.loyaltyCard.findUnique({
      where: { publicTokenHash: hashToken(token) },
      include: { customer: true, program: true, business: true, walletPasses: true },
    });
    if (!card || card.status !== "ACTIVE") {
      throw new DomainException(HttpStatus.NOT_FOUND, "NOT_FOUND", "No encontramos esa tarjeta");
    }
    hiddenIfForeign(user, card);
    return {
      ...presentCard(card),
      businessName: card.business.name,
    };
  }

  async get(user: AuthUser, id: string) {
    const card = await this.cardOrThrow(id);
    assertBusinessAccess(user, card);
    return presentCard(card, { includeContact: user.role !== "EMPLOYEE" });
  }

  async transactions(user: AuthUser, cardId: string) {
    const card = await this.cardOrThrow(cardId);
    assertBusinessAccess(user, card);
    const rows = await this.prisma.stampTransaction.findMany({
      where: { cardId },
      include: { employee: true, branch: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      stampsDelta: row.stampsDelta,
      balanceAfter: row.balanceAfter,
      cycle: row.cycle,
      createdAt: row.createdAt,
      employeeName: row.employee.name,
      branchName: row.branch?.name ?? null,
      reversesId: row.reversesId,
    }));
  }

  async addStamp(
    user: AuthUser,
    cardId: string,
    input: { scanToken: string; idempotencyKey: string; branchId?: string },
    ip?: string,
  ) {
    this.assertStaff(user);
    try {
      const outcome = await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM loyalty_cards WHERE id = ${cardId} FOR UPDATE`;
        const card = await tx.loyaltyCard.findUnique({
          where: { id: cardId },
          include: { customer: true, program: true, business: true },
        });
        if (!card) throw new DomainException(HttpStatus.NOT_FOUND, "NOT_FOUND", "No encontramos esa tarjeta");
        assertBusinessAccess(user, card);
        if (hashToken(input.scanToken) !== card.publicTokenHash) {
          throw new DomainException(HttpStatus.UNAUTHORIZED, "BAD_SCAN_TOKEN", "El código no corresponde a esta tarjeta");
        }
        const existing = await tx.stampTransaction.findUnique({
          where: { businessId_idempotencyKey: { businessId: card.businessId, idempotencyKey: input.idempotencyKey } },
        });
        if (existing) {
          if (existing.cardId !== card.id) {
            throw new DomainException(HttpStatus.CONFLICT, "IDEMPOTENCY_CONFLICT", "Esa clave ya se usó en otra tarjeta");
          }
          return { replay: true as const, card, transactionId: existing.id, balance: existing.balanceAfter };
        }
        const now = new Date();
        const earnedToday = await this.countActiveEarns(tx, card.id, startOfZonedDay(now, card.business.timezone));
        const decision = evaluateStamp({
          currentStamps: card.currentStamps,
          stampsRequired: card.program.stampsRequired,
          rewardAvailable: card.rewardAvailable,
          blockWhenRewardAvailable: card.program.blockWhenRewardAvailable,
          earnedToday,
          maxStampsPerDay: card.program.maxStampsPerDay,
          lastStampAt: card.lastStampAt,
          now,
          cooldownSeconds: card.program.cooldownSeconds,
          cardActive: card.status === "ACTIVE" && card.business.active,
          programActive: card.program.status === "ACTIVE" && this.within(card.program, now),
          selfScan: this.samePerson(user.email, card.customer.email),
        });
        if (!decision.ok) throw new DomainException(HttpStatus.CONFLICT, decision.code, decision.message);
        const updated = await tx.loyaltyCard.updateMany({
          where: { id: card.id, lockVersion: card.lockVersion, currentStamps: card.currentStamps },
          data: {
            currentStamps: decision.nextStamps,
            rewardAvailable: decision.rewardUnlocked,
            lastStampAt: now,
            lockVersion: { increment: 1 },
            version: { increment: 1 },
          },
        });
        if (updated.count !== 1) {
          throw new DomainException(HttpStatus.CONFLICT, "CONFLICT", "La tarjeta cambió. Intenta de nuevo.");
        }
        const branchId = await this.resolveBranch(tx, user, card.businessId, input.branchId);
        const transaction = await tx.stampTransaction.create({
          data: {
            tenantId: card.tenantId,
            businessId: card.businessId,
            branchId,
            customerId: card.customerId,
            cardId: card.id,
            programId: card.programId,
            employeeId: user.id,
            type: "EARN",
            stampsDelta: 1,
            balanceAfter: decision.nextStamps,
            cycle: card.cycle,
            idempotencyKey: input.idempotencyKey,
          },
        });
        return {
          replay: false as const,
          card,
          transactionId: transaction.id,
          balance: decision.nextStamps,
          rewardAvailable: decision.rewardUnlocked,
        };
      });
      if (outcome.replay) {
        const fresh = await this.cardOrThrow(cardId);
        return this.payload(fresh, outcome.transactionId, true, replayWallet);
      }
      const wallet = await this.wallet.sync(cardId);
      const fresh = await this.cardOrThrow(cardId);
      await this.audit.record({
        tenantId: fresh.tenantId,
        actorId: user.id,
        action: "STAMP_EARNED",
        entityType: "StampTransaction",
        entityId: outcome.transactionId,
        ip,
        metadata: { balance: fresh.currentStamps, wallet },
      });
      return this.payload(fresh, outcome.transactionId, false, wallet);
    } catch (error) {
      return this.replayFromUnique(error, cardId, input.idempotencyKey);
    }
  }

  async redeem(user: AuthUser, input: { cardId: string; idempotencyKey: string; branchId?: string }, ip?: string) {
    this.assertStaff(user);
    const outcome = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM loyalty_cards WHERE id = ${input.cardId} FOR UPDATE`;
      const card = await tx.loyaltyCard.findUnique({
        where: { id: input.cardId },
        include: { program: true, customer: true },
      });
      if (!card) throw new DomainException(HttpStatus.NOT_FOUND, "NOT_FOUND", "No encontramos esa tarjeta");
      assertBusinessAccess(user, card);
      const existing = await tx.rewardRedemption.findUnique({
        where: { businessId_idempotencyKey: { businessId: card.businessId, idempotencyKey: input.idempotencyKey } },
      });
      if (existing) return { replay: true as const, cardId: card.id, redemptionId: existing.id };
      if (!card.rewardAvailable || card.currentStamps < card.program.stampsRequired) {
        throw new DomainException(HttpStatus.CONFLICT, "REWARD_NOT_READY", "Esta tarjeta todavía no tiene una recompensa lista");
      }
      if (this.samePerson(user.email, card.customer.email)) {
        throw new DomainException(HttpStatus.CONFLICT, "SELF_SCAN", "No puedes canjear tu propia tarjeta");
      }
      const reward = await tx.reward.findFirst({ where: { programId: card.programId, active: true } });
      if (!reward) throw new DomainException(HttpStatus.CONFLICT, "REWARD_MISSING", "El programa no tiene una recompensa activa");
      const branchId = await this.resolveBranch(tx, user, card.businessId, input.branchId);
      const redemption = await tx.rewardRedemption.create({
        data: {
          tenantId: card.tenantId,
          businessId: card.businessId,
          branchId,
          rewardId: reward.id,
          cardId: card.id,
          customerId: card.customerId,
          employeeId: user.id,
          cycle: card.cycle,
          idempotencyKey: input.idempotencyKey,
        },
      });
      await tx.stampTransaction.create({
        data: {
          tenantId: card.tenantId,
          businessId: card.businessId,
          branchId,
          customerId: card.customerId,
          cardId: card.id,
          programId: card.programId,
          employeeId: user.id,
          type: "REDEEM",
          stampsDelta: -card.currentStamps,
          balanceAfter: 0,
          cycle: card.cycle,
          idempotencyKey: input.idempotencyKey,
        },
      });
      await tx.loyaltyCard.update({
        where: { id: card.id },
        data: {
          currentStamps: 0,
          rewardAvailable: false,
          cycle: { increment: 1 },
          version: { increment: 1 },
          lockVersion: { increment: 1 },
        },
      });
      return { replay: false as const, cardId: card.id, redemptionId: redemption.id, tenantId: card.tenantId };
    });
    if (!outcome.replay) {
      await this.audit.record({
        tenantId: outcome.tenantId,
        actorId: user.id,
        action: "REWARD_REDEEMED",
        entityType: "RewardRedemption",
        entityId: outcome.redemptionId,
        ip,
      });
    }
    const wallet = outcome.replay ? replayWallet : await this.wallet.sync(outcome.cardId);
    const fresh = await this.cardOrThrow(outcome.cardId);
    return { ...presentCard(fresh), redemptionId: outcome.redemptionId, replay: outcome.replay, wallet };
  }

  async reverse(user: AuthUser, transactionId: string, idempotencyKey: string, ip?: string) {
    if (user.role !== "BUSINESS_ADMIN" && user.role !== "SUPER_ADMIN") {
      throw new DomainException(HttpStatus.FORBIDDEN, "FORBIDDEN", "Solo un administrador puede revertir un sello");
    }
    const outcome = await this.prisma.$transaction(async (tx) => {
      const original = await tx.stampTransaction.findUnique({ where: { id: transactionId } });
      if (!original || original.type !== "EARN") {
        throw new DomainException(HttpStatus.NOT_FOUND, "NOT_FOUND", "No encontramos ese sello");
      }
      await tx.$queryRaw`SELECT id FROM loyalty_cards WHERE id = ${original.cardId} FOR UPDATE`;
      const card = await tx.loyaltyCard.findUnique({
        where: { id: original.cardId },
        include: { program: true },
      });
      if (!card) throw new DomainException(HttpStatus.NOT_FOUND, "NOT_FOUND", "No encontramos esa tarjeta");
      assertBusinessAccess(user, card);
      const already = await tx.stampTransaction.findFirst({ where: { reversesId: original.id } });
      if (already) {
        throw new DomainException(HttpStatus.CONFLICT, "ALREADY_REVERSED", "Ese sello ya fue revertido");
      }
      const redeemed = await tx.rewardRedemption.findFirst({
        where: { cardId: card.id, cycle: original.cycle, status: "COMPLETED" },
      });
      if (redeemed || card.cycle !== original.cycle) {
        throw new DomainException(HttpStatus.CONFLICT, "CYCLE_CLOSED", "No se puede revertir un sello de un ciclo ya canjeado");
      }
      const later = await tx.stampTransaction.findFirst({
        where: {
          cardId: card.id,
          cycle: original.cycle,
          type: "EARN",
          createdAt: { gt: original.createdAt },
        },
      });
      if (later) {
        throw new DomainException(HttpStatus.CONFLICT, "NOT_LATEST", "Solo se puede revertir el último sello del ciclo");
      }
      const next = card.currentStamps - 1;
      if (next < 0) throw new DomainException(HttpStatus.CONFLICT, "EMPTY_CARD", "La tarjeta no tiene sellos que revertir");
      const reversal = await tx.stampTransaction.create({
        data: {
          tenantId: card.tenantId,
          businessId: card.businessId,
          branchId: original.branchId,
          customerId: card.customerId,
          cardId: card.id,
          programId: card.programId,
          employeeId: user.id,
          type: "REVERSAL",
          stampsDelta: -1,
          balanceAfter: next,
          cycle: card.cycle,
          idempotencyKey,
          reversesId: original.id,
        },
      });
      await tx.loyaltyCard.update({
        where: { id: card.id },
        data: {
          currentStamps: next,
          rewardAvailable: next >= card.program.stampsRequired,
          version: { increment: 1 },
          lockVersion: { increment: 1 },
        },
      });
      return { reversalId: reversal.id, tenantId: card.tenantId, cardId: card.id };
    });
    const wallet = await this.wallet.sync(outcome.cardId);
    await this.audit.record({
      tenantId: outcome.tenantId,
      actorId: user.id,
      action: "STAMP_REVERSED",
      entityType: "StampTransaction",
      entityId: outcome.reversalId,
      ip,
      metadata: { wallet },
    });
    const fresh = await this.cardOrThrow(outcome.cardId);
    return { ...presentCard(fresh), reversalId: outcome.reversalId, wallet };
  }

  async rotate(user: AuthUser, cardId: string) {
    if (user.role === "EMPLOYEE" || user.role === "CUSTOMER") {
      throw new DomainException(HttpStatus.FORBIDDEN, "FORBIDDEN", "No puedes rotar el código de la tarjeta");
    }
    const card = await this.cardOrThrow(cardId);
    assertBusinessAccess(user, card);
    const token = generateOpaqueToken();
    await this.prisma.loyaltyCard.update({
      where: { id: card.id },
      data: {
        publicTokenHash: hashToken(token),
        publicTokenEncrypted: encryptSecret(token),
        version: { increment: 1 },
      },
    });
    const wallet = await this.wallet.sync(card.id);
    const configWeb = (await import("../config/configuration")).getConfig().publicWebUrl;
    await this.audit.record({
      tenantId: card.tenantId,
      actorId: user.id,
      action: "CARD_TOKEN_ROTATED",
      entityType: "LoyaltyCard",
      entityId: card.id,
    });
    return { cardUrl: `${configWeb}/t/${token}`, token, wallet };
  }

  async pendingRewards(user: AuthUser) {
    const rows = await this.prisma.loyaltyCard.findMany({
      where: { ...scopeFor(user), rewardAvailable: true, status: "ACTIVE" },
      include: { customer: true, program: true, business: true, walletPasses: true },
      orderBy: { updatedAt: "desc" },
      take: 50,
    });
    return rows.map((card) => ({ ...presentCard(card), businessName: card.business.name }));
  }

  private async replayFromUnique(error: unknown, cardId: string, idempotencyKey: string): Promise<never | object> {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await this.prisma.stampTransaction.findFirst({ where: { cardId, idempotencyKey } });
      if (existing) {
        const fresh = await this.cardOrThrow(cardId);
        return this.payload(fresh, existing.id, true, replayWallet);
      }
    }
    throw error;
  }

  private payload(
    card: Awaited<ReturnType<StampsService["cardOrThrow"]>>,
    transactionId: string,
    replay: boolean,
    wallet: WalletReport,
  ) {
    return {
      ...presentCard(card),
      transactionId,
      replay,
      wallet,
      stamps: stampView({
        current: card.currentStamps,
        required: card.program.stampsRequired,
        icon: card.program.stampIcon,
        rewardAvailable: card.rewardAvailable,
      }),
    };
  }

  private async cardOrThrow(id: string) {
    const card = await this.prisma.loyaltyCard.findUnique({
      where: { id },
      include: { customer: true, program: true, business: true, walletPasses: true },
    });
    if (!card) throw new DomainException(HttpStatus.NOT_FOUND, "NOT_FOUND", "No encontramos esa tarjeta");
    return card;
  }

  private assertStaff(user: AuthUser) {
    if (!isStaff(user)) {
      throw new DomainException(HttpStatus.FORBIDDEN, "FORBIDDEN", "Un cliente no puede registrar sellos");
    }
  }

  private samePerson(staffEmail: string, customerEmail: string | null) {
    return Boolean(customerEmail && staffEmail.toLowerCase() === customerEmail.toLowerCase());
  }

  private within(program: { startsAt: Date | null; endsAt: Date | null }, now: Date) {
    if (program.startsAt && program.startsAt > now) return false;
    if (program.endsAt && program.endsAt < now) return false;
    return true;
  }

  private async countActiveEarns(tx: Prisma.TransactionClient, cardId: string, from: Date) {
    const earns = await tx.stampTransaction.findMany({
      where: { cardId, type: "EARN", createdAt: { gte: from } },
      select: { id: true },
    });
    if (!earns.length) return 0;
    const reversals = await tx.stampTransaction.findMany({
      where: { type: "REVERSAL", reversesId: { in: earns.map((earn) => earn.id) } },
      select: { reversesId: true },
    });
    const reversed = new Set(reversals.map((item) => item.reversesId));
    return earns.filter((earn) => !reversed.has(earn.id)).length;
  }

  private async resolveBranch(
    tx: Prisma.TransactionClient,
    user: AuthUser,
    businessId: string,
    requested?: string,
  ) {
    const branchId = user.branchId || requested;
    if (branchId) {
      const branch = await tx.branch.findFirst({ where: { id: branchId, businessId, active: true } });
      if (!branch) throw new DomainException(HttpStatus.BAD_REQUEST, "BRANCH", "La sucursal no pertenece a este negocio");
      return branch.id;
    }
    const branches = await tx.branch.findMany({ where: { businessId, active: true }, take: 2 });
    if (branches.length === 1) return branches[0].id;
    if (branches.length > 1) {
      throw new DomainException(HttpStatus.BAD_REQUEST, "BRANCH_REQUIRED", "Elige la sucursal antes de registrar el sello");
    }
    return null;
  }
}
