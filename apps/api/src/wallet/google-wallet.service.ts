import { HttpStatus, Injectable } from "@nestjs/common";
import fs from "fs";
import jwt from "jsonwebtoken";
import { GoogleAuth } from "google-auth-library";
import type { WalletSyncState } from "@intelekia/shared";
import { getConfig } from "../config/configuration";
import { decryptSecret, generateSerialNumber } from "../common/crypto.util";
import { DomainException } from "../common/domain.exception";
import { PrismaService } from "../prisma/prisma.service";
import { buildLoyaltyClass, buildLoyaltyObject } from "./pass-model";

const SCOPE = "https://www.googleapis.com/auth/wallet_object.issuer";

@Injectable()
export class GoogleWalletService {
  constructor(private readonly prisma: PrismaService) {}

  async saveLink(cardId: string) {
    const config = getConfig();
    if (!config.google.configured) {
      throw new DomainException(
        HttpStatus.SERVICE_UNAVAILABLE,
        "WALLET_NOT_CONFIGURED",
        "Google Wallet no está configurado. Define el issuer ID y la cuenta de servicio. Consulta docs/WALLET-SETUP.md.",
      );
    }
    const card = await this.load(cardId);
    const logo = this.logoFor(card.business.logoUrl);
    if (!logo) {
      throw new DomainException(
        HttpStatus.SERVICE_UNAVAILABLE,
        "WALLET_NOT_CONFIGURED",
        "Google Wallet exige un logotipo en una URL HTTPS pública (GOOGLE_WALLET_LOGO_URL o el logo del negocio).",
      );
    }
    const account = this.account();
    const serial = await this.ensureSerial(card.id);
    const classId = `${config.google.issuerId}.${card.programId}`;
    const objectId = `${config.google.issuerId}.${serial}`;
    await this.putClass(classId, buildLoyaltyClass({
      id: classId,
      issuerName: card.business.name,
      programName: card.program.name,
      logoUrl: logo,
      hexBackground: card.program.cardBackground,
    }));
    const loyaltyObject = buildLoyaltyObject({
      id: objectId,
      classId,
      accountName: card.customer.name,
      serialNumber: serial,
      scanToken: decryptSecret(card.publicTokenEncrypted),
      current: card.currentStamps,
      required: card.program.stampsRequired,
      rewardTitle: card.program.rewardTitle,
      rewardAvailable: card.rewardAvailable,
      icon: card.program.stampIcon,
      heroUrl: this.heroUrl(decryptSecret(card.publicTokenEncrypted)),
    });
    await this.putObject(objectId, loyaltyObject);
    await this.prisma.walletPass.upsert({
      where: { cardId_provider: { cardId: card.id, provider: "GOOGLE" } },
      update: { googleObjectId: objectId, googleClassId: classId, serialNumber: serial },
      create: {
        cardId: card.id,
        provider: "GOOGLE",
        serialNumber: serial,
        googleObjectId: objectId,
        googleClassId: classId,
      },
    });
    const token = jwt.sign(
      {
        iss: account.email,
        aud: "google",
        origins: config.google.origins,
        typ: "savetowallet",
        payload: { loyaltyObjects: [{ id: objectId }] },
      },
      account.key,
      { algorithm: "RS256" },
    );
    return { saveUrl: `https://pay.google.com/gp/v/save/${token}`, objectId };
  }

  async updateExisting(cardId: string): Promise<{ status: WalletSyncState; detail: string }> {
    const config = getConfig();
    if (!config.google.configured) {
      return { status: "not_configured", detail: "Google Wallet no tiene cuenta de servicio. No se llamó a la API." };
    }
    const pass = await this.prisma.walletPass.findUnique({
      where: { cardId_provider: { cardId, provider: "GOOGLE" } },
    });
    if (!pass?.googleObjectId) {
      return { status: "not_issued", detail: "El cliente todavía no tiene un objeto de Google Wallet" };
    }
    try {
      const card = await this.load(cardId);
      const loyaltyObject = buildLoyaltyObject({
        id: pass.googleObjectId,
        classId: pass.googleClassId || `${config.google.issuerId}.${card.programId}`,
        accountName: card.customer.name,
        serialNumber: pass.serialNumber,
        scanToken: decryptSecret(card.publicTokenEncrypted),
        current: card.currentStamps,
        required: card.program.stampsRequired,
        rewardTitle: card.program.rewardTitle,
        rewardAvailable: card.rewardAvailable,
        icon: card.program.stampIcon,
        heroUrl: this.heroUrl(decryptSecret(card.publicTokenEncrypted)),
      });
      await this.request("PATCH", `/loyaltyObject/${pass.googleObjectId}`, loyaltyObject);
      return { status: "updated", detail: "Google Wallet recibió el nuevo saldo" };
    } catch (error) {
      return { status: "failed", detail: messageOf(error) };
    }
  }

  private async load(cardId: string) {
    const card = await this.prisma.loyaltyCard.findUnique({
      where: { id: cardId },
      include: { customer: true, program: true, business: true },
    });
    if (!card) throw new DomainException(HttpStatus.NOT_FOUND, "NOT_FOUND", "No encontramos esa tarjeta");
    return card;
  }

  private async ensureSerial(cardId: string) {
    const existing = await this.prisma.walletPass.findUnique({
      where: { cardId_provider: { cardId, provider: "GOOGLE" } },
    });
    return existing?.serialNumber || generateSerialNumber();
  }

  private logoFor(businessLogo: string | null) {
    const config = getConfig();
    const candidate = config.google.logoUrl || businessLogo || "";
    return candidate.startsWith("https://") ? candidate : null;
  }

  private heroUrl(token: string) {
    const base = getConfig().publicBaseUrl;
    if (!base.startsWith("https://")) return undefined;
    return `${base}/api/public/cards/${token}/stamp-strip.png`;
  }

  private account() {
    const config = getConfig().google;
    if (config.serviceAccountFile) {
      const parsed = JSON.parse(fs.readFileSync(config.serviceAccountFile, "utf8")) as {
        client_email: string;
        private_key: string;
      };
      return { email: parsed.client_email, key: parsed.private_key };
    }
    return { email: config.clientEmail, key: config.privateKey };
  }

  private async putClass(id: string, body: object) {
    try {
      await this.request("GET", `/loyaltyClass/${id}`);
      await this.request("PUT", `/loyaltyClass/${id}`, body);
    } catch (error) {
      if (statusOf(error) === 404) {
        await this.request("POST", "/loyaltyClass", body);
        return;
      }
      throw error;
    }
  }

  private async putObject(id: string, body: object) {
    try {
      await this.request("GET", `/loyaltyObject/${id}`);
      await this.request("PUT", `/loyaltyObject/${id}`, body);
    } catch (error) {
      if (statusOf(error) === 404) {
        await this.request("POST", "/loyaltyObject", body);
        return;
      }
      throw error;
    }
  }

  private async request(method: "GET" | "POST" | "PUT" | "PATCH", pathname: string, data?: object) {
    const auth = new GoogleAuth({
      scopes: [SCOPE],
      keyFile: getConfig().google.serviceAccountFile || undefined,
      credentials: getConfig().google.serviceAccountFile
        ? undefined
        : { client_email: this.account().email, private_key: this.account().key },
    });
    const client = await auth.getClient();
    return client.request({
      url: `https://walletobjects.googleapis.com/walletobjects/v1${pathname}`,
      method,
      data,
    });
  }
}

function statusOf(error: unknown) {
  const record = error as { response?: { status?: number }; code?: number };
  return record.response?.status || record.code || 0;
}

function messageOf(error: unknown) {
  if (error instanceof Error) return error.message.slice(0, 280);
  return "Google Wallet rechazó la actualización";
}
