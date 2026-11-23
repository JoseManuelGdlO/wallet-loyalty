import { HttpStatus, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { assertBusinessAccess, scopeFor, type AuthUser } from "../common/access";
import { DomainException } from "../common/domain.exception";
import { PrismaService } from "../prisma/prisma.service";
import { WalletSyncService } from "../wallet/wallet-sync.service";
import type { UpsertProgramDto } from "./dto";

@Injectable()
export class ProgramsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletSyncService,
  ) {}

  list(user: AuthUser) {
    return this.prisma.loyaltyProgram.findMany({
      where: scopeFor(user),
      include: { rewards: { where: { active: true }, take: 1 }, business: { select: { name: true, slug: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  async get(user: AuthUser, id: string) {
    const program = await this.prisma.loyaltyProgram.findUnique({
      where: { id },
      include: { rewards: true, business: true },
    });
    if (!program) throw new DomainException(HttpStatus.NOT_FOUND, "NOT_FOUND", "No encontramos ese programa");
    assertBusinessAccess(user, program);
    return program;
  }

  async create(user: AuthUser, dto: UpsertProgramDto) {
    const business = await this.prisma.business.findUnique({
      where: { id: dto.businessId },
      include: { tenant: { include: { plan: true } } },
    });
    if (!business) throw new DomainException(HttpStatus.NOT_FOUND, "NOT_FOUND", "No encontramos ese negocio");
    assertBusinessAccess(user, { tenantId: business.tenantId, businessId: business.id });
    if (user.role === "EMPLOYEE") {
      throw new DomainException(HttpStatus.FORBIDDEN, "FORBIDDEN", "No puedes crear programas");
    }
    const programs = await this.prisma.loyaltyProgram.count({ where: { businessId: business.id } });
    if (programs >= business.tenant.plan.maxPrograms) {
      throw new DomainException(HttpStatus.CONFLICT, "PLAN_LIMIT", "El plan alcanzó el máximo de programas");
    }
    return this.prisma.$transaction(async (tx) => {
      const program = await tx.loyaltyProgram.create({ data: this.toData(business.tenantId, dto) });
      await tx.reward.create({
        data: {
          tenantId: business.tenantId,
          businessId: business.id,
          programId: program.id,
          title: dto.rewardTitle,
          description: dto.rewardDescription,
          imageUrl: dto.rewardImageUrl,
        },
      });
      return program;
    });
  }

  async update(user: AuthUser, id: string, dto: UpsertProgramDto) {
    const current = await this.get(user, id);
    if (user.role === "EMPLOYEE") {
      throw new DomainException(HttpStatus.FORBIDDEN, "FORBIDDEN", "No puedes editar programas");
    }
    if (dto.businessId !== current.businessId) {
      throw new DomainException(HttpStatus.BAD_REQUEST, "BUSINESS_MISMATCH", "El programa no cambia de negocio");
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const program = await tx.loyaltyProgram.update({
        where: { id },
        data: this.toData(current.tenantId, dto),
      });
      await tx.reward.updateMany({
        where: { programId: id, active: true },
        data: {
          title: dto.rewardTitle,
          description: dto.rewardDescription,
          imageUrl: dto.rewardImageUrl,
        },
      });
      return program;
    });
    await this.refreshPasses(id);
    return updated;
  }

  private async refreshPasses(programId: string) {
    const cards = await this.prisma.loyaltyCard.findMany({ where: { programId }, select: { id: true } });
    if (!cards.length) return;
    await this.prisma.loyaltyCard.updateMany({ where: { programId }, data: { updatedAt: new Date() } });
    await Promise.all(cards.map((card) => this.wallet.sync(card.id)));
  }

  private toData(tenantId: string, dto: UpsertProgramDto): Prisma.LoyaltyProgramUncheckedCreateInput {
    return {
      tenantId,
      businessId: dto.businessId,
      name: dto.name,
      description: dto.description,
      stampsRequired: dto.stampsRequired,
      rewardTitle: dto.rewardTitle,
      rewardDescription: dto.rewardDescription,
      rewardImageUrl: dto.rewardImageUrl,
      stampIcon: dto.stampIcon || "●",
      stampIconUrl: dto.stampIconUrl?.trim() || null,
      cardBackground: dto.cardBackground,
      cardForeground: dto.cardForeground,
      cardLabel: dto.cardLabel,
      startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
      endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
      status: dto.status === "INACTIVE" ? "INACTIVE" : "ACTIVE",
      maxStampsPerDay: dto.maxStampsPerDay,
      cooldownSeconds: dto.cooldownSeconds,
      blockWhenRewardAvailable: dto.blockWhenRewardAvailable,
    };
  }
}
