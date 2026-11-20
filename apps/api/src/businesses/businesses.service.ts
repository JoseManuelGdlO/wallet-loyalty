import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { assertBusinessAccess, scopeFor, type AuthUser } from "../common/access";
import { DomainException } from "../common/domain.exception";
import { HttpStatus } from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import type { BusinessStatusDto, CreateBranchDto, CreateBusinessDto, CreateEmployeeDto, CreatePlanDto, UpdateBusinessDto } from "./dto";

@Injectable()
export class BusinessesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(user: AuthUser) {
    const scope = scopeFor(user);
    return this.prisma.business.findMany({
      where: {
        ...(scope.tenantId ? { tenantId: scope.tenantId } : {}),
        ...(scope.businessId ? { id: scope.businessId } : {}),
      },
      include: {
        tenant: { include: { plan: true } },
        branches: { where: { active: true } },
        _count: { select: { customers: true, programs: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async get(user: AuthUser, id: string) {
    const business = await this.prisma.business.findUnique({
      where: { id },
      include: {
        tenant: { include: { plan: true } },
        branches: { orderBy: { name: "asc" } },
        _count: { select: { customers: true, programs: true, users: true } },
      },
    });
    if (!business) throw new NotFoundException("No encontramos ese negocio");
    assertBusinessAccess(user, { tenantId: business.tenantId, businessId: business.id });
    return business;
  }

  async create(user: AuthUser, dto: CreateBusinessDto) {
    if (user.role !== "SUPER_ADMIN") throw new ForbiddenException("Solo un superadministrador puede crear negocios");
    const plan = await this.prisma.subscriptionPlan.findUnique({ where: { code: dto.planCode } });
    if (!plan?.active) throw new NotFoundException("No encontramos ese plan");
    const role = await this.prisma.role.findUniqueOrThrow({ where: { code: "BUSINESS_ADMIN" } });
    const passwordHash = await bcrypt.hash(dto.adminPassword, 10);
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const tenant = await tx.tenant.create({ data: { name: dto.name, planId: plan.id } });
        const business = await tx.business.create({
          data: {
            tenantId: tenant.id,
            name: dto.name,
            slug: dto.slug,
            description: dto.description,
            primaryColor: dto.primaryColor || "#102033",
            secondaryColor: dto.secondaryColor || "#A56B2A",
          },
        });
        const branch = await tx.branch.create({
          data: {
            tenantId: tenant.id,
            businessId: business.id,
            name: dto.branchName || "Matriz",
          },
        });
        const admin = await tx.user.create({
          data: {
            tenantId: tenant.id,
            businessId: business.id,
            branchId: branch.id,
            roleId: role.id,
            email: dto.adminEmail.toLowerCase(),
            name: dto.adminName,
            passwordHash,
          },
        });
        return { business, branch, admin: { id: admin.id, email: admin.email, name: admin.name } };
      });
      await this.audit.record({
        tenantId: created.business.tenantId,
        actorId: user.id,
        action: "BUSINESS_CREATED",
        entityType: "Business",
        entityId: created.business.id,
      });
      return created;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("Ese identificador o correo ya está en uso");
      }
      throw error;
    }
  }

  async update(user: AuthUser, id: string, dto: UpdateBusinessDto) {
    const business = await this.get(user, id);
    if (user.role === "EMPLOYEE") throw new ForbiddenException("No puedes editar el negocio");
    return this.prisma.business.update({ where: { id: business.id }, data: dto });
  }

  async setStatus(user: AuthUser, id: string, dto: BusinessStatusDto) {
    if (user.role !== "SUPER_ADMIN") throw new ForbiddenException("Solo un superadministrador puede cambiar el estado");
    const business = await this.prisma.business.findUnique({ where: { id } });
    if (!business) throw new NotFoundException("No encontramos ese negocio");
    const [updated] = await this.prisma.$transaction([
      this.prisma.business.update({ where: { id }, data: { active: dto.active } }),
      this.prisma.tenant.update({
        where: { id: business.tenantId },
        data: { status: dto.active ? "ACTIVE" : "SUSPENDED" },
      }),
    ]);
    await this.audit.record({
      tenantId: business.tenantId,
      actorId: user.id,
      action: dto.active ? "BUSINESS_ACTIVATED" : "BUSINESS_SUSPENDED",
      entityType: "Business",
      entityId: id,
    });
    return updated;
  }

  async branches(user: AuthUser, businessId: string) {
    await this.get(user, businessId);
    return this.prisma.branch.findMany({ where: { businessId }, orderBy: { name: "asc" } });
  }

  async addBranch(user: AuthUser, businessId: string, dto: CreateBranchDto) {
    const business = await this.get(user, businessId);
    if (user.role === "EMPLOYEE") throw new ForbiddenException("No puedes crear sucursales");
    return this.prisma.branch.create({
      data: { tenantId: business.tenantId, businessId: business.id, name: dto.name, address: dto.address },
    });
  }

  async employees(user: AuthUser, businessId: string) {
    await this.get(user, businessId);
    const rows = await this.prisma.user.findMany({
      where: { businessId, role: { code: { in: ["BUSINESS_ADMIN", "EMPLOYEE"] } } },
      include: { role: true, branch: true },
      orderBy: { name: "asc" },
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role.code,
      status: row.status,
      branchId: row.branchId,
      branchName: row.branch?.name ?? null,
    }));
  }

  async addEmployee(user: AuthUser, businessId: string, dto: CreateEmployeeDto) {
    const business = await this.get(user, businessId);
    if (user.role === "EMPLOYEE") throw new ForbiddenException("No puedes registrar empleados");
    if (dto.branchId) {
      const branch = await this.prisma.branch.findFirst({ where: { id: dto.branchId, businessId } });
      if (!branch) throw new NotFoundException("No encontramos esa sucursal");
    }
    const role = await this.prisma.role.findUniqueOrThrow({ where: { code: "EMPLOYEE" } });
    try {
      const created = await this.prisma.user.create({
        data: {
          tenantId: business.tenantId,
          businessId: business.id,
          branchId: dto.branchId,
          roleId: role.id,
          name: dto.name,
          email: dto.email.toLowerCase(),
          passwordHash: await bcrypt.hash(dto.password, 10),
        },
      });
      return { id: created.id, name: created.name, email: created.email };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("Ese correo ya tiene acceso");
      }
      throw error;
    }
  }

  async plans(user: AuthUser) {
    if (user.role === "SUPER_ADMIN") {
      return this.prisma.subscriptionPlan.findMany({ orderBy: { monthlyPriceCents: "asc" } });
    }
    if (!user.tenantId) throw new ForbiddenException("No autorizado");
    const tenant = await this.prisma.tenant.findUnique({ where: { id: user.tenantId }, include: { plan: true } });
    return tenant?.plan ? [tenant.plan] : [];
  }

  async createPlan(user: AuthUser, dto: CreatePlanDto) {
    if (user.role !== "SUPER_ADMIN") {
      throw new DomainException(HttpStatus.FORBIDDEN, "FORBIDDEN", "Solo un superadministrador configura planes");
    }
    return this.prisma.subscriptionPlan.create({ data: dto });
  }
}
