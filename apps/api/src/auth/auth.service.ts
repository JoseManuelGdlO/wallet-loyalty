import { Injectable, OnModuleInit, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import bcrypt from "bcryptjs";
import type { Response } from "express";
import { getConfig } from "../config/configuration";
import { generateOpaqueToken, hashToken, refreshExpiry } from "../common/crypto.util";
import type { AuthUser } from "../common/access";
import { PrismaService } from "../prisma/prisma.service";
import { ensureRoles } from "./roles";

export const REFRESH_COOKIE = "ilk_refresh";

@Injectable()
export class AuthService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async onModuleInit() {
    await ensureRoles(this.prisma);
  }

  cookieOptions() {
    const config = getConfig();
    return {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: config.publicWebUrl.startsWith("https://"),
      path: "/api/auth",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    };
  }

  async login(email: string, password: string, response: Response) {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: { role: true, tenant: true, business: true },
    });
    const valid = user ? await bcrypt.compare(password, user.passwordHash) : false;
    if (!user || !valid) {
      throw new UnauthorizedException("Correo o contraseña incorrectos");
    }
    if (user.status !== "ACTIVE") {
      throw new UnauthorizedException("Tu acceso está desactivado");
    }
    if (user.tenant && user.tenant.status !== "ACTIVE") {
      throw new UnauthorizedException("Este negocio está suspendido");
    }
    if (user.business && !user.business.active) {
      throw new UnauthorizedException("Este negocio está suspendido");
    }
    const authUser: AuthUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role.code,
      tenantId: user.tenantId,
      businessId: user.businessId,
      branchId: user.branchId,
    };
    const accessToken = await this.signAccess(authUser);
    await this.issueRefresh(user.id, response);
    return { accessToken, user: authUser };
  }

  async refresh(rawToken: string | undefined, response: Response) {
    if (!rawToken) throw new UnauthorizedException("Inicia sesión de nuevo");
    const found = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(rawToken) },
      include: { user: { include: { role: true, tenant: true, business: true } } },
    });
    if (!found) throw new UnauthorizedException("Inicia sesión de nuevo");
    if (found.revokedAt) {
      await this.prisma.refreshToken.updateMany({
        where: { userId: found.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException("La sesión se cerró por seguridad");
    }
    if (found.expiresAt.getTime() < Date.now() || found.user.status !== "ACTIVE") {
      throw new UnauthorizedException("Inicia sesión de nuevo");
    }
    await this.prisma.refreshToken.update({
      where: { id: found.id },
      data: { revokedAt: new Date() },
    });
    const authUser: AuthUser = {
      id: found.user.id,
      email: found.user.email,
      name: found.user.name,
      role: found.user.role.code,
      tenantId: found.user.tenantId,
      businessId: found.user.businessId,
      branchId: found.user.branchId,
    };
    const accessToken = await this.signAccess(authUser);
    await this.issueRefresh(found.user.id, response);
    return { accessToken, user: authUser };
  }

  async logout(rawToken: string | undefined, response: Response) {
    if (rawToken) {
      await this.prisma.refreshToken.updateMany({
        where: { tokenHash: hashToken(rawToken), revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    response.clearCookie(REFRESH_COOKIE, this.cookieOptions());
    return { ok: true };
  }

  private async signAccess(user: AuthUser) {
    const config = getConfig();
    return this.jwt.signAsync(
      {
        sub: user.id,
        role: user.role,
        tenantId: user.tenantId,
        businessId: user.businessId,
        branchId: user.branchId,
      },
      { secret: config.jwtAccessSecret, expiresIn: config.jwtAccessTtl },
    );
  }

  private async issueRefresh(userId: string, response: Response) {
    const token = generateOpaqueToken();
    await this.prisma.refreshToken.create({
      data: { userId, tokenHash: hashToken(token), expiresAt: refreshExpiry() },
    });
    response.cookie(REFRESH_COOKIE, token, this.cookieOptions());
  }
}
