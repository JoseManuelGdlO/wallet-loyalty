import { config } from "dotenv";
import fs from "fs";
import path from "path";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { encryptSecret, generateOpaqueToken, hashToken } from "../src/common/crypto.util";
import { ensureRoles } from "../src/auth/roles";

config({ path: path.resolve(__dirname, "../../../.env") });

const prisma = new PrismaClient();
const password = "Demo1234!";

async function main() {
  await ensureRoles(prisma);
  const plan = await prisma.subscriptionPlan.upsert({
    where: { code: "local" },
    update: {},
    create: {
      code: "local",
      name: "Local",
      description: "Un negocio, programas de lealtad y clientes para operación diaria.",
      maxBusinesses: 1,
      maxCustomers: 5000,
      maxPrograms: 10,
      monthlyPriceCents: 0,
    },
  });
  await prisma.subscriptionPlan.upsert({
    where: { code: "crecimiento" },
    update: {},
    create: {
      code: "crecimiento",
      name: "Crecimiento",
      description: "Varias sucursales y más clientes.",
      maxBusinesses: 5,
      maxCustomers: 25000,
      maxPrograms: 30,
      monthlyPriceCents: 49000,
    },
  });

  const superRole = await prisma.role.findUniqueOrThrow({ where: { code: "SUPER_ADMIN" } });
  const adminRole = await prisma.role.findUniqueOrThrow({ where: { code: "BUSINESS_ADMIN" } });
  const employeeRole = await prisma.role.findUniqueOrThrow({ where: { code: "EMPLOYEE" } });
  const passwordHash = await bcrypt.hash(password, 10);

  await prisma.user.upsert({
    where: { email: "super@intelekia.test" },
    update: {},
    create: {
      roleId: superRole.id,
      email: "super@intelekia.test",
      name: "Superadministrador",
      passwordHash,
    },
  });

  let business = await prisma.business.findUnique({ where: { slug: "cafeteria-demo" } });
  if (!business) {
    const tenant = await prisma.tenant.create({ data: { name: "Cafetería Demo", planId: plan.id } });
    business = await prisma.business.create({
      data: {
        tenantId: tenant.id,
        name: "Cafetería Demo",
        slug: "cafeteria-demo",
        description: "Café de barrio. Diez visitas y el siguiente americano va por la casa.",
        primaryColor: "#102033",
        secondaryColor: "#A56B2A",
        address: "Av. Reforma 120, Centro",
        phone: "+525511110000",
      },
    });
    const branch = await prisma.branch.create({
      data: { tenantId: tenant.id, businessId: business.id, name: "Centro", address: business.address },
    });
    await prisma.user.create({
      data: {
        tenantId: tenant.id,
        businessId: business.id,
        branchId: branch.id,
        roleId: adminRole.id,
        email: "ana.admin@cafeteria-demo.test",
        name: "Ana Rivas",
        passwordHash,
      },
    });
    const employee = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        businessId: business.id,
        branchId: branch.id,
        roleId: employeeRole.id,
        email: "luis.empleado@cafeteria-demo.test",
        name: "Luis Romero",
        passwordHash,
      },
    });
    const program = await prisma.loyaltyProgram.create({
      data: {
        tenantId: tenant.id,
        businessId: business.id,
        name: "Café frecuente",
        description: "Compra 10 cafés y recibe uno gratis.",
        stampsRequired: 10,
        rewardTitle: "Café americano gratis",
        rewardDescription: "Un americano de la casa al completar la tarjeta.",
        stampIcon: "☕",
        cardBackground: "#102033",
        cardForeground: "#F4F7F8",
        cardLabel: "#E0B15A",
        maxStampsPerDay: 5,
        cooldownSeconds: 60,
      },
    });
    const reward = await prisma.reward.create({
      data: {
        tenantId: tenant.id,
        businessId: business.id,
        programId: program.id,
        title: "Café americano gratis",
        description: "Un americano de la casa al completar la tarjeta.",
      },
    });
    const maria = await issue(tenant.id, business.id, program.id, "María López", "maria@demo.test", 4, employee.id, branch.id);
    const pedro = await issue(tenant.id, business.id, program.id, "Pedro Ramírez", "pedro@demo.test", 10, employee.id, branch.id);
    await prisma.loyaltyCard.update({ where: { id: pedro.cardId }, data: { rewardAvailable: true } });
    void reward;
    const demo = {
      public: "http://localhost:5173/c/cafeteria-demo",
      cards: [
        { name: "María López", url: maria.url, token: maria.token, stamps: 4 },
        { name: "Pedro Ramírez", url: pedro.url, token: pedro.token, stamps: 10 },
      ],
    };
    fs.writeFileSync(path.resolve(__dirname, "../.demo-cards.json"), JSON.stringify(demo, null, 2));
    console.log(JSON.stringify(demo, null, 2));
  }

  console.log("Accesos locales (solo desarrollo):");
  console.log("super@intelekia.test / Demo1234!");
  console.log("ana.admin@cafeteria-demo.test / Demo1234!");
  console.log("luis.empleado@cafeteria-demo.test / Demo1234!");
  console.log("Registro público: http://localhost:5173/c/cafeteria-demo");
}

async function issue(
  tenantId: string,
  businessId: string,
  programId: string,
  name: string,
  email: string,
  stamps: number,
  employeeId: string,
  branchId: string,
) {
  const token = generateOpaqueToken();
  const customer = await prisma.customer.create({ data: { tenantId, businessId, name, email } });
  const card = await prisma.loyaltyCard.create({
    data: {
      tenantId,
      businessId,
      customerId: customer.id,
      programId,
      publicTokenHash: hashToken(token),
      publicTokenEncrypted: encryptSecret(token),
      currentStamps: stamps,
      lastStampAt: new Date(),
      version: stamps + 1,
    },
  });
  for (let index = 0; index < stamps; index += 1) {
    await prisma.stampTransaction.create({
      data: {
        tenantId,
        businessId,
        branchId,
        customerId: customer.id,
        cardId: card.id,
        programId,
        employeeId,
        type: "EARN",
        stampsDelta: 1,
        balanceAfter: index + 1,
        cycle: 1,
        idempotencyKey: `seed-${card.id}-${index}`,
        createdAt: new Date(Date.now() - (stamps - index) * 60_000),
      },
    });
  }
  return { token, url: `http://localhost:5173/t/${token}`, cardId: card.id };
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
