import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { getConfig } from "../config/configuration";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthUser } from "../common/access";

type Payload = {
  sub: string;
  role: AuthUser["role"];
  tenantId: string | null;
  businessId: string | null;
  branchId: string | null;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: getConfig().jwtAccessSecret,
    });
  }

  async validate(payload: Payload): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { role: true, tenant: true, business: true },
    });
    if (!user || user.status !== "ACTIVE") {
      throw new UnauthorizedException("La sesión ya no es válida");
    }
    if (user.tenant && user.tenant.status !== "ACTIVE") {
      throw new UnauthorizedException("Este negocio está suspendido");
    }
    if (user.business && !user.business.active) {
      throw new UnauthorizedException("Este negocio está suspendido");
    }
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role.code,
      tenantId: user.tenantId,
      businessId: user.businessId,
      branchId: user.branchId,
    };
  }
}
