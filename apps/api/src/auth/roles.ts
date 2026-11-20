import { PrismaClient, RoleCode } from "@prisma/client";

const ROLES: Array<{ code: RoleCode; name: string; description: string }> = [
  {
    code: "SUPER_ADMIN",
    name: "Superadministrador",
    description: "Administra todos los negocios, planes y métricas globales.",
  },
  {
    code: "BUSINESS_ADMIN",
    name: "Administrador del negocio",
    description: "Configura programas, empleados, clientes y puede revertir sellos.",
  },
  {
    code: "EMPLOYEE",
    name: "Empleado",
    description: "Escanea tarjetas, registra sellos y canjea recompensas.",
  },
  {
    code: "CUSTOMER",
    name: "Cliente",
    description: "Consulta sus tarjetas. No puede registrar sellos.",
  },
];

export async function ensureRoles(prisma: PrismaClient) {
  for (const role of ROLES) {
    await prisma.role.upsert({
      where: { code: role.code },
      update: { name: role.name, description: role.description },
      create: role,
    });
  }
}
