import { HttpStatus, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { stampView } from "@intelekia/shared";
import { getConfig } from "../config/configuration";
import { assertBusinessAccess, scopeFor, type AuthUser } from "../common/access";
import { encryptSecret, generateOpaqueToken, hashToken } from "../common/crypto.util";
import { DomainException } from "../common/domain.exception";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { maskContact } from "./card-view";
import type { CreateCardDto, RegisterCustomerDto } from "./dto";

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async publicBusiness(slug: string) {
    const business = await this.prisma.business.findUnique({
      where: { slug },
      include: {
        programs: { where: { status: "ACTIVE" }, orderBy: { createdAt: "asc" } },
        tenant: true,
      },
    });
    if (!business || !business.active || business.tenant.status !== "ACTIVE") {
      throw new DomainException(HttpStatus.NOT_FOUND, "NOT_FOUND", "No encontramos ese negocio");
    }
    const now = new Date();
    return {
      name: business.name,
      slug: business.slug,
      description: business.description,
      logoUrl: business.logoUrl,
      phone: business.phone,
      address: business.address,
      colors: { primary: business.primaryColor, secondary: business.secondaryColor },
      programs: business.programs
        .filter((program) => this.isCurrent(program, now))
        .map((program) => ({
          id: program.id,
          name: program.name,
          description: program.description,
          stampsRequired: program.stampsRequired,
          rewardTitle: program.rewardTitle,
          rewardDescription: program.rewardDescription,
          rewardImageUrl: program.rewardImageUrl,
          stampIcon: program.stampIcon,
          colors: {
            background: program.cardBackground,
            foreground: program.cardForeground,
            label: program.cardLabel,
          },
          stamps: stampView({
            current: 0,
            required: program.stampsRequired,
            icon: program.stampIcon,
            rewardAvailable: false,
          }),
        })),
    };
  }

  async register(dto: RegisterCustomerDto, ip?: string) {
    if (dto.companyWebsite?.trim()) {
      throw new DomainException(HttpStatus.BAD_REQUEST, "REJECTED", "No se pudo completar el registro");
    }
    const elapsed = Date.now() - dto.formStartedAt;
    if (elapsed < 1500 || elapsed > 2 * 60 * 60 * 1000) {
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        "FORM_TIMING",
        "Vuelve a abrir el formulario y espera un momento antes de enviarlo",
      );
    }
    const email = dto.email?.trim().toLowerCase() || null;
    const phone = dto.phone?.replace(/[^\d+]/g, "") || null;
    if (!email && !phone) {
      throw new DomainException(HttpStatus.BAD_REQUEST, "CONTACT_REQUIRED", "Indica un correo o un teléfono");
    }
    const business = await this.prisma.business.findUnique({
      where: { slug: dto.businessSlug },
      include: { tenant: { include: { plan: true } }, programs: { where: { status: "ACTIVE" } } },
    });
    if (!business || !business.active || business.tenant.status !== "ACTIVE") {
      throw new DomainException(HttpStatus.NOT_FOUND, "NOT_FOUND", "No encontramos ese negocio");
    }
    const now = new Date();
    const available = business.programs.filter((program) => this.isCurrent(program, now));
    const program = dto.programId ? available.find((item) => item.id === dto.programId) : available[0];
    if (!program) {
      throw new DomainException(HttpStatus.BAD_REQUEST, "PROGRAM_UNAVAILABLE", "Ese programa no está disponible");
    }
    const customers = await this.prisma.customer.count({ where: { businessId: business.id } });
    if (customers >= business.tenant.plan.maxCustomers) {
      throw new DomainException(HttpStatus.CONFLICT, "PLAN_LIMIT", "Este negocio alcanzó el máximo de clientes de su plan");
    }
    const token = generateOpaqueToken();
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const customer = await tx.customer.create({
          data: {
            tenantId: business.tenantId,
            businessId: business.id,
            name: dto.name.trim(),
            email,
            phone,
          },
        });
        const card = await tx.loyaltyCard.create({
          data: {
            tenantId: business.tenantId,
            businessId: business.id,
            customerId: customer.id,
            programId: program.id,
            publicTokenHash: hashToken(token),
            publicTokenEncrypted: encryptSecret(token),
          },
        });
        return { customer, card };
      });
      await this.audit.record({
        tenantId: business.tenantId,
        action: "CUSTOMER_REGISTERED",
        entityType: "LoyaltyCard",
        entityId: created.card.id,
        ip,
        metadata: { businessId: business.id, programId: program.id },
      });
      return this.registrationPayload(token, business.name, program.name, program.stampsRequired, program.stampIcon);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new DomainException(
          HttpStatus.CONFLICT,
          "DUPLICATE_CUSTOMER",
          "Ya existe una tarjeta con ese correo o teléfono",
        );
      }
      throw error;
    }
  }

  async issue(user: AuthUser, dto: CreateCardDto) {
    const customer = await this.prisma.customer.findUnique({ where: { id: dto.customerId } });
    if (!customer) throw new DomainException(HttpStatus.NOT_FOUND, "NOT_FOUND", "No encontramos a ese cliente");
    assertBusinessAccess(user, customer);
    const program = await this.prisma.loyaltyProgram.findFirst({
      where: { id: dto.programId, businessId: customer.businessId, status: "ACTIVE" },
    });
    if (!program) throw new DomainException(HttpStatus.NOT_FOUND, "NOT_FOUND", "No encontramos ese programa");
    const token = generateOpaqueToken();
    try {
      const card = await this.prisma.loyaltyCard.create({
        data: {
          tenantId: customer.tenantId,
          businessId: customer.businessId,
          customerId: customer.id,
          programId: program.id,
          publicTokenHash: hashToken(token),
          publicTokenEncrypted: encryptSecret(token),
        },
      });
      await this.audit.record({
        tenantId: customer.tenantId,
        actorId: user.id,
        action: "CARD_ISSUED",
        entityType: "LoyaltyCard",
        entityId: card.id,
      });
      return this.registrationPayload(token, "", program.name, program.stampsRequired, program.stampIcon, card.id);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new DomainException(HttpStatus.CONFLICT, "CARD_EXISTS", "Ese cliente ya tiene tarjeta en este programa");
      }
      throw error;
    }
  }

  async list(user: AuthUser, page = 1, pageSize = 20, q?: string) {
    const where: Prisma.CustomerWhereInput = {
      ...scopeFor(user),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
              { phone: { contains: q } },
            ],
          }
        : {}),
    };
    const reveal = user.role !== "EMPLOYEE";
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.customer.count({ where }),
      this.prisma.customer.findMany({
        where,
        include: { cards: { include: { program: true } } },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      total,
      page,
      pageSize,
      items: rows.map((customer) => {
        const stamps = customer.cards.reduce((sum, card) => sum + card.currentStamps, 0);
        const rewards = customer.cards.filter((card) => card.rewardAvailable).length;
        const lastVisit = customer.cards.reduce<Date | null>((latest, card) => {
          if (!card.lastStampAt) return latest;
          if (!latest || card.lastStampAt > latest) return card.lastStampAt;
          return latest;
        }, null);
        return {
          id: customer.id,
          name: customer.name,
          email: maskContact(customer.email, reveal),
          phone: maskContact(customer.phone, reveal),
          createdAt: customer.createdAt,
          programs: customer.cards.map((card) => card.program.name),
          stamps,
          rewardsAvailable: rewards,
          lastVisit,
        };
      }),
    };
  }

  async get(user: AuthUser, id: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: {
        cards: { include: { program: true, walletPasses: true }, orderBy: { createdAt: "desc" } },
      },
    });
    if (!customer) throw new DomainException(HttpStatus.NOT_FOUND, "NOT_FOUND", "No encontramos a ese cliente");
    assertBusinessAccess(user, customer);
    const reveal = user.role !== "EMPLOYEE";
    return {
      id: customer.id,
      name: customer.name,
      email: maskContact(customer.email, reveal),
      phone: maskContact(customer.phone, reveal),
      createdAt: customer.createdAt,
      cards: customer.cards.map((card) => ({
        id: card.id,
        programName: card.program.name,
        stampIcon: card.program.stampIcon,
        currentStamps: card.currentStamps,
        stampsRequired: card.program.stampsRequired,
        rewardAvailable: card.rewardAvailable,
        rewardTitle: card.program.rewardTitle,
        cycle: card.cycle,
        lastStampAt: card.lastStampAt,
        stamps: stampView({
          current: card.currentStamps,
          required: card.program.stampsRequired,
          icon: card.program.stampIcon,
          rewardAvailable: card.rewardAvailable,
        }),
        colors: {
          background: card.program.cardBackground,
          foreground: card.program.cardForeground,
          label: card.program.cardLabel,
        },
      })),
    };
  }

  async findByToken(token: string) {
    return this.prisma.loyaltyCard.findUnique({
      where: { publicTokenHash: hashToken(token) },
      include: {
        customer: true,
        program: true,
        business: true,
        walletPasses: true,
      },
    });
  }

  private registrationPayload(
    token: string,
    businessName: string,
    programName: string,
    stampsRequired: number,
    stampIcon: string,
    cardId?: string,
  ) {
    const config = getConfig();
    return {
      cardId,
      businessName,
      programName,
      token,
      cardUrl: `${config.publicWebUrl}/t/${token}`,
      stamps: stampView({ current: 0, required: stampsRequired, icon: stampIcon, rewardAvailable: false }),
    };
  }

  private isCurrent(program: { startsAt: Date | null; endsAt: Date | null }, now: Date) {
    if (program.startsAt && program.startsAt > now) return false;
    if (program.endsAt && program.endsAt < now) return false;
    return true;
  }
}
