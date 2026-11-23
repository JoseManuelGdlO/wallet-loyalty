import { buildLoyaltyObject, buildStoreCardPass } from "./pass-model";

const visual = {
  businessName: "Cafetería Demo",
  programName: "Café frecuente",
  customerName: "María López",
  rewardTitle: "Café americano gratis",
  current: 4,
  required: 10,
  rewardAvailable: false,
  icon: "☕",
  cycle: 1,
  background: "#102033",
  foreground: "#F4F7F8",
  label: "#E0B15A",
  scanToken: "ilk_testtoken",
  serialNumber: "sn_demo",
  authenticationToken: "a".repeat(32),
  passTypeIdentifier: "pass.com.intelekia.loyalty",
  teamIdentifier: "TEAMID1234",
  webServiceURL: "https://loyalty.example/api/wallet/apple",
};

describe("modelo de pases", () => {
  it("escribe el progreso en el storeCard y el QR, sin HTML", () => {
    const pass = buildStoreCardPass(visual);
    expect(pass.storeCard.headerFields[0].value).toBe("4/10");
    expect(pass.storeCard.secondaryFields[0]).toMatchObject({ label: "NOMBRE", value: "María López" });
    expect(pass.storeCard.auxiliaryFields[1].value).toBe("Café americano gratis");
    expect(pass.storeCard).not.toHaveProperty("primaryFields");
    expect(pass.barcode.message).toBe("ilk_testtoken");
    expect(JSON.stringify(pass)).not.toContain("<html");
    expect(pass.authenticationToken.length).toBeGreaterThanOrEqual(16);
  });

  it("usa solo la imagen cuando el negocio subió su logotipo", () => {
    const pass = buildStoreCardPass({ ...visual, hasLogo: true });
    expect(pass.logoText).toBeUndefined();
  });

  it("el objeto de Google Wallet lleva el saldo nuevo de sellos", () => {
    const object = buildLoyaltyObject({
      id: "issuer.sn_demo",
      classId: "issuer.program",
      accountName: "María López",
      serialNumber: "sn_demo",
      scanToken: "ilk_testtoken",
      current: 5,
      required: 10,
      rewardTitle: "Café americano gratis",
      rewardAvailable: false,
      icon: "☕",
    });
    expect(object.loyaltyPoints).toEqual({ label: "Sellos", balance: { int: 5 } });
    expect(object.barcode).toMatchObject({ type: "QR_CODE", value: "ilk_testtoken" });
  });
});
