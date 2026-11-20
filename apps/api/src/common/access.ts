import { ForbiddenException, NotFoundException } from "@nestjs/common";
import type { RoleCode } from "@intelekia/shared";

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: RoleCode;
  tenantId: string | null;
  businessId: string | null;
  branchId: string | null;
};

export function isStaff(user: AuthUser): boolean {
  return user.role === "SUPER_ADMIN" || user.role === "BUSINESS_ADMIN" || user.role === "EMPLOYEE";
}

export function canAccessBusiness(
  user: AuthUser,
  target: { tenantId: string; businessId: string },
): boolean {
  if (user.role === "SUPER_ADMIN") return true;
  if (!isStaff(user)) return false;
  return user.tenantId === target.tenantId && user.businessId === target.businessId;
}

export function assertBusinessAccess(
  user: AuthUser,
  target: { tenantId: string; businessId: string },
): void {
  if (!canAccessBusiness(user, target)) {
    throw new ForbiddenException("No autorizado para este negocio");
  }
}

export function hiddenIfForeign(
  user: AuthUser,
  target: { tenantId: string; businessId: string },
): void {
  if (!canAccessBusiness(user, target)) {
    throw new NotFoundException("No encontramos esa tarjeta");
  }
}

export function scopeFor(user: AuthUser): { tenantId?: string; businessId?: string } {
  if (user.role === "SUPER_ADMIN") return {};
  return { tenantId: user.tenantId ?? "__none__", businessId: user.businessId ?? "__none__" };
}
