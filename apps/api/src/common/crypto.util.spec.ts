import { generateOpaqueToken, hashToken, encryptSecret, decryptSecret } from "./crypto.util";

describe("tokens opacos", () => {
  const key = Buffer.alloc(32, 4);

  it("no es predecible y no contiene un id interno", () => {
    const first = generateOpaqueToken();
    const second = generateOpaqueToken();
    expect(first).toMatch(/^ilk_[A-Za-z0-9_-]{40,}$/);
    expect(first).not.toBe(second);
    expect(hashToken(first)).not.toContain(first.slice(4));
  });

  it("el hash no revela el token y el cifrado sí permite reconstruir el pase", () => {
    const token = generateOpaqueToken();
    const hashed = hashToken(token);
    expect(hashed).toHaveLength(64);
    expect(hashed).not.toContain(token.slice(4, 12));
    expect(decryptSecret(encryptSecret(token, key), key)).toBe(token);
  });
});
