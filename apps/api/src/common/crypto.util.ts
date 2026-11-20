import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { getConfig } from "../config/configuration";

export function generateOpaqueToken(): string {
  return `ilk_${randomBytes(32).toString("base64url")}`;
}

export function generateSerialNumber(): string {
  return `sn_${randomBytes(16).toString("base64url")}`;
}

export function generateAppleAuthToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashToken(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function encryptSecret(plain: string, key = getConfig().encryptionKey): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64url"), tag.toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptSecret(payload: string, key = getConfig().encryptionKey): string {
  const [ivPart, tagPart, dataPart] = payload.split(".");
  if (!ivPart || !tagPart || !dataPart) {
    throw new Error("Secreto cifrado inválido");
  }
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivPart, "base64url"));
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(dataPart, "base64url")),
    decipher.final(),
  ]);
  return plain.toString("utf8");
}

export function refreshExpiry(from = new Date()): Date {
  const ttl = getConfig().jwtRefreshTtl;
  const match = /^(\d+)([dh])$/.exec(ttl);
  const date = new Date(from);
  if (!match) {
    date.setDate(date.getDate() + 7);
    return date;
  }
  const amount = Number(match[1]);
  if (match[2] === "h") date.setHours(date.getHours() + amount);
  else date.setDate(date.getDate() + amount);
  return date;
}
