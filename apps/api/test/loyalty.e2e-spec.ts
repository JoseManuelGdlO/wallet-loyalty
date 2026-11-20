import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import bcrypt from "bcryptjs";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { ensureRoles } from "../src/auth/roles";
import { configureApp } from "../src/configure-app";
import { hashToken, encryptSecret, generateAppleAuthToken } from "../src/common/crypto.util";
import { PrismaService } from "../src/prisma/prisma.service";

describe("Intelekia Loyalty", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(`
      TRUNCATE TABLE
        audit_logs,
        wallet_device_registrations,
        wallet_passes,
        reward_redemptions,
        stamp_transactions,
        rewards,
        loyalty_cards,
        customers,
        loyalty_programs,
        refresh_tokens,
        users,
        branches,
        businesses,
        tenants,
        subscription_plans,
        roles
      RESTART IDENTITY CASCADE
    `);
  });

  it("registra un cliente, evita el duplicado y no sella sin confirmación autenticada", async () => {
    const fx = await fixture();
    const started = Date.now() - 5000;
    const created = await request(app.getHttpServer())
      .post("/api/customers/register")
      .send({ businessSlug: "cafeteria-a", name: "Lucía Mora", email: "lucia@demo.test", formStartedAt: started })
      .expect(201);
    expect(created.body.token).toMatch(/^ilk_/);
    expect(created.body.cardUrl).toContain("/t/");

    const duplicate = await request(app.getHttpServer())
      .post("/api/customers/register")
      .send({ businessSlug: "cafeteria-a", name: "Lucía Mora", email: "lucia@demo.test", formStartedAt: started })
      .expect(409);
    expect(duplicate.body.code).toBe("DUPLICATE_CUSTOMER");

    const card = await request(app.getHttpServer()).get(`/api/public/cards/${created.body.token}`).expect(200);
    expect(card.body.email).toBeUndefined();
    expect(card.body.stamps.current).toBe(0);

    await request(app.getHttpServer())
      .post(`/api/loyalty/cards/${created.body.cardId || "missing"}/stamps`)
      .set("Idempotency-Key", "sin-sesion-123")
      .send({ scanToken: created.body.token })
      .expect(401);

    const lookup = await request(app.getHttpServer())
      .post("/api/loyalty/cards/lookup")
      .set("Authorization", `Bearer ${fx.employeeToken}`)
      .send({ token: created.body.token })
      .expect(201);
    const cardId = lookup.body.id as string;

    const stamped = await request(app.getHttpServer())
      .post(`/api/loyalty/cards/${cardId}/stamps`)
      .set("Authorization", `Bearer ${fx.employeeToken}`)
      .set("Idempotency-Key", "visita-lucia-001")
      .send({ scanToken: created.body.token })
      .expect(201);
    expect(stamped.body.currentStamps).toBe(1);
    expect(stamped.body.replay).toBe(false);
    expect(stamped.body.wallet.apple.status).toBe("not_configured");
    expect(stamped.body.wallet.google.status).toBe("not_configured");

    const replay = await request(app.getHttpServer())
      .post(`/api/loyalty/cards/${cardId}/stamps`)
      .set("Authorization", `Bearer ${fx.employeeToken}`)
      .set("Idempotency-Key", "visita-lucia-001")
      .send({ scanToken: created.body.token })
      .expect(201);
    expect(replay.body.replay).toBe(true);
    expect(replay.body.currentStamps).toBe(1);

    await request(app.getHttpServer())
      .post("/api/loyalty/cards/lookup")
      .set("Authorization", `Bearer ${fx.otherToken}`)
      .send({ token: created.body.token })
      .expect(404);

    await request(app.getHttpServer())
      .post(`/api/loyalty/cards/${cardId}/stamps`)
      .set("Authorization", `Bearer ${fx.otherToken}`)
      .set("Idempotency-Key", "visita-ajena-001")
      .send({ scanToken: created.body.token })
      .expect(403);

    await request(app.getHttpServer())
      .post(`/api/loyalty/cards/${cardId}/stamps`)
      .set("Authorization", `Bearer ${fx.customerToken}`)
      .set("Idempotency-Key", "cliente-no-puede-01")
      .send({ scanToken: created.body.token })
      .expect(403);
  });

  it("completa 10 sellos, canjea, abre otro ciclo y permite revertir solo al administrador", async () => {
    const fx = await fixture();
    const started = Date.now() - 5000;
    const created = await request(app.getHttpServer())
      .post("/api/customers/register")
      .send({ businessSlug: "cafeteria-a", name: "Elena Díaz", phone: "+525500000111", formStartedAt: started })
      .expect(201);
    const lookup = await request(app.getHttpServer())
      .post("/api/loyalty/cards/lookup")
      .set("Authorization", `Bearer ${fx.employeeToken}`)
      .send({ token: created.body.token })
      .expect(201);

    for (let index = 0; index < 10; index += 1) {
      const response = await request(app.getHttpServer())
        .post(`/api/loyalty/cards/${lookup.body.id}/stamps`)
        .set("Authorization", `Bearer ${fx.employeeToken}`)
        .set("Idempotency-Key", `elena-sello-${index}`)
        .send({ scanToken: created.body.token })
        .expect(201);
      expect(response.body.currentStamps).toBe(index + 1);
    }

    const blocked = await request(app.getHttpServer())
      .post(`/api/loyalty/cards/${lookup.body.id}/stamps`)
      .set("Authorization", `Bearer ${fx.employeeToken}`)
      .set("Idempotency-Key", "elena-extra-01")
      .send({ scanToken: created.body.token })
      .expect(409);
    expect(blocked.body.code).toBe("REWARD_PENDING");

    const redeemed = await request(app.getHttpServer())
      .post("/api/loyalty/rewards/redeem")
      .set("Authorization", `Bearer ${fx.employeeToken}`)
      .set("Idempotency-Key", "canje-elena-01")
      .send({ cardId: lookup.body.id })
      .expect(201);
    expect(redeemed.body.currentStamps).toBe(0);
    expect(redeemed.body.rewardAvailable).toBe(false);
    expect(redeemed.body.cycle).toBe(2);

    const again = await request(app.getHttpServer())
      .post(`/api/loyalty/cards/${lookup.body.id}/stamps`)
      .set("Authorization", `Bearer ${fx.employeeToken}`)
      .set("Idempotency-Key", "elena-ciclo-2a")
      .send({ scanToken: created.body.token })
      .expect(201);
    expect(again.body.currentStamps).toBe(1);

    await request(app.getHttpServer())
      .post(`/api/loyalty/transactions/${again.body.transactionId}/reverse`)
      .set("Authorization", `Bearer ${fx.employeeToken}`)
      .set("Idempotency-Key", "reversa-empleado")
      .expect(403);

    const reversed = await request(app.getHttpServer())
      .post(`/api/loyalty/transactions/${again.body.transactionId}/reverse`)
      .set("Authorization", `Bearer ${fx.adminToken}`)
      .set("Idempotency-Key", "reversa-admin-01")
      .expect(201);
    expect(reversed.body.currentStamps).toBe(0);
  });

  it("serializa dos sellos simultáneos y respeta el máximo del día", async () => {
    const fx = await fixture();
    const started = Date.now() - 5000;
    const created = await request(app.getHttpServer())
      .post("/api/customers/register")
      .send({ businessSlug: "cafeteria-a", name: "Hugo Paz", email: "hugo@demo.test", formStartedAt: started })
      .expect(201);
    const lookup = await request(app.getHttpServer())
      .post("/api/loyalty/cards/lookup")
      .set("Authorization", `Bearer ${fx.employeeToken}`)
      .send({ token: created.body.token })
      .expect(201);
    const [first, second] = await Promise.all([
      request(app.getHttpServer())
        .post(`/api/loyalty/cards/${lookup.body.id}/stamps`)
        .set("Authorization", `Bearer ${fx.employeeToken}`)
        .set("Idempotency-Key", "hugo-paralelo-a")
        .send({ scanToken: created.body.token }),
      request(app.getHttpServer())
        .post(`/api/loyalty/cards/${lookup.body.id}/stamps`)
        .set("Authorization", `Bearer ${fx.employeeToken}`)
        .set("Idempotency-Key", "hugo-paralelo-b")
        .send({ scanToken: created.body.token }),
    ]);
    expect([first.status, second.status].sort()).toEqual([201, 201]);
    const card = await prisma.loyaltyCard.findUniqueOrThrow({ where: { id: lookup.body.id } });
    expect(card.currentStamps).toBe(2);

    await prisma.loyaltyProgram.update({ where: { id: fx.programId }, data: { maxStampsPerDay: 2 } });
    const limited = await request(app.getHttpServer())
      .post(`/api/loyalty/cards/${lookup.body.id}/stamps`)
      .set("Authorization", `Bearer ${fx.employeeToken}`)
      .set("Idempotency-Key", "hugo-limite-c")
      .send({ scanToken: created.body.token })
      .expect(409);
    expect(limited.body.code).toBe("DAILY_LIMIT");
  });

  it("registra el dispositivo de Apple y no finge un pkpass sin certificados", async () => {
    const fx = await fixture();
    const started = Date.now() - 5000;
    const created = await request(app.getHttpServer())
      .post("/api/customers/register")
      .send({ businessSlug: "cafeteria-a", name: "Rita Sol", email: "rita@demo.test", formStartedAt: started })
      .expect(201);
    const card = await prisma.loyaltyCard.findFirstOrThrow({ where: { customer: { email: "rita@demo.test" } } });
    const authToken = generateAppleAuthToken();
    process.env.APPLE_PASS_TYPE_IDENTIFIER = "pass.com.intelekia.loyalty";
    await prisma.walletPass.create({
      data: {
        cardId: card.id,
        provider: "APPLE",
        serialNumber: "sn_rita",
        authTokenHash: hashToken(authToken),
        authTokenEncrypted: encryptSecret(authToken),
      },
    });
    await request(app.getHttpServer())
      .post("/api/wallet/apple/v1/devices/device-rita/registrations/pass.com.intelekia.loyalty/sn_rita")
      .set("Authorization", `ApplePass ${authToken}`)
      .send({ pushToken: "apns-token-rita-001" })
      .expect(201);
    const list = await request(app.getHttpServer())
      .get("/api/wallet/apple/v1/devices/device-rita/registrations/pass.com.intelekia.loyalty")
      .expect(200);
    expect(list.body.serialNumbers).toContain("sn_rita");
    const download = await request(app.getHttpServer())
      .get("/api/public/cards/" + created.body.token + "/apple.pkpass")
      .expect(503);
    expect(download.body.code).toBe("WALLET_NOT_CONFIGURED");
    const google = await request(app.getHttpServer())
      .post("/api/public/cards/" + created.body.token + "/google")
      .expect(503);
    expect(google.body.code).toBe("WALLET_NOT_CONFIGURED");
    void fx;
  });

  async function fixture() {
    await ensureRoles(prisma);
    const plan = await prisma.subscriptionPlan.create({
      data: {
        code: "test",
        name: "Test",
        description: "Plan de prueba",
        maxBusinesses: 5,
        maxCustomers: 100,
        maxPrograms: 5,
        monthlyPriceCents: 0,
      },
    });
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { code: "BUSINESS_ADMIN" } });
    const employeeRole = await prisma.role.findUniqueOrThrow({ where: { code: "EMPLOYEE" } });
    const customerRole = await prisma.role.findUniqueOrThrow({ where: { code: "CUSTOMER" } });
    const passwordHash = await bcrypt.hash("Demo1234!", 10);

    const first = await makeBusiness("Cafetería A", "cafeteria-a");
    const second = await makeBusiness("Cafetería B", "cafeteria-b");

    const program = await prisma.loyaltyProgram.create({
      data: {
        tenantId: first.tenantId,
        businessId: first.businessId,
        name: "Café frecuente",
        stampsRequired: 10,
        rewardTitle: "Café americano gratis",
        stampIcon: "☕",
        maxStampsPerDay: 20,
        cooldownSeconds: 0,
        cardBackground: "#102033",
        cardForeground: "#F4F7F8",
        cardLabel: "#E0B15A",
      },
    });
    await prisma.reward.create({
      data: {
        tenantId: first.tenantId,
        businessId: first.businessId,
        programId: program.id,
        title: "Café americano gratis",
      },
    });
    await prisma.loyaltyProgram.create({
      data: {
        tenantId: second.tenantId,
        businessId: second.businessId,
        name: "Otro",
        stampsRequired: 5,
        rewardTitle: "Galleta",
        maxStampsPerDay: 5,
        cooldownSeconds: 0,
      },
    });

    await prisma.user.create({
      data: {
        tenantId: first.tenantId,
        businessId: first.businessId,
        branchId: first.branchId,
        roleId: adminRole.id,
        email: "admin-a@test.local",
        name: "Admin A",
        passwordHash,
      },
    });
    await prisma.user.create({
      data: {
        tenantId: first.tenantId,
        businessId: first.businessId,
        branchId: first.branchId,
        roleId: employeeRole.id,
        email: "empleado-a@test.local",
        name: "Empleado A",
        passwordHash,
      },
    });
    await prisma.user.create({
      data: {
        tenantId: second.tenantId,
        businessId: second.businessId,
        branchId: second.branchId,
        roleId: employeeRole.id,
        email: "empleado-b@test.local",
        name: "Empleado B",
        passwordHash,
      },
    });
    await prisma.user.create({
      data: {
        tenantId: first.tenantId,
        businessId: first.businessId,
        roleId: customerRole.id,
        email: "cliente-a@test.local",
        name: "Cliente A",
        passwordHash,
      },
    });

    async function makeBusiness(name: string, slug: string) {
      const tenant = await prisma.tenant.create({ data: { name, planId: plan.id } });
      const business = await prisma.business.create({ data: { tenantId: tenant.id, name, slug } });
      const branch = await prisma.branch.create({ data: { tenantId: tenant.id, businessId: business.id, name: "Matriz" } });
      return { tenantId: tenant.id, businessId: business.id, branchId: branch.id };
    }

    const login = async (email: string) => {
      const response = await request(app.getHttpServer())
        .post("/api/auth/login")
        .send({ email, password: "Demo1234!" })
        .expect(201);
      return response.body.accessToken as string;
    };

    return {
      programId: program.id,
      adminToken: await login("admin-a@test.local"),
      employeeToken: await login("empleado-a@test.local"),
      otherToken: await login("empleado-b@test.local"),
      customerToken: await login("cliente-a@test.local"),
    };
  }
});
