import { HttpStatus, Injectable, UnauthorizedException } from "@nestjs/common";
import fs from "fs";
import path from "path";
import { PKPass } from "passkit-generator";
import { getConfig } from "../config/configuration";
import { decryptSecret, encryptSecret, generateAppleAuthToken, generateSerialNumber, hashToken } from "../common/crypto.util";
import { DomainException } from "../common/domain.exception";
import { PrismaService } from "../prisma/prisma.service";
import { buildStoreCardPass } from "./pass-model";
import { renderIcons, renderLogos, renderStrip } from "./stamp-artwork";

const NOT_CONFIGURED =
  "Apple Wallet no está configurado. Define el Pass Type ID, el Team ID y las rutas de los certificados. Consulta docs/WALLET-SETUP.md.";

@Injectable()
export class ApplePassService {
  constructor(private readonly prisma: PrismaService) {}

  async pkpassForCard(cardId: string) {
    const loaded = await this.prepare(cardId);
    return this.sign(loaded);
  }

  async pkpassForSerial(serialNumber: string, passTypeIdentifier: string, authenticationToken: string, ifModifiedSince?: string) {
    this.assertPassType(passTypeIdentifier);
    const pass = await this.prisma.walletPass.findUnique({
      where: { serialNumber },
      include: { card: true },
    });
    if (!pass?.authTokenHash || pass.authTokenHash !== hashToken(authenticationToken)) {
      throw new UnauthorizedException();
    }
    if (ifModifiedSince) {
      const since = new Date(ifModifiedSince);
      if (!Number.isNaN(since.getTime()) && pass.card.updatedAt.getTime() <= since.getTime()) {
        return { notModified: true as const, updatedAt: pass.card.updatedAt };
      }
    }
    const signed = await this.pkpassForCard(pass.cardId);
    return { notModified: false as const, buffer: signed.buffer, updatedAt: signed.updatedAt };
  }

  async registerDevice(input: {
    deviceLibraryIdentifier: string;
    passTypeIdentifier: string;
    serialNumber: string;
    authenticationToken: string;
    pushToken: string;
  }) {
    this.assertPassType(input.passTypeIdentifier);
    const pass = await this.authorizedPass(input.serialNumber, input.authenticationToken);
    const existing = await this.prisma.walletDeviceRegistration.findUnique({
      where: {
        walletPassId_deviceLibraryIdentifier: {
          walletPassId: pass.id,
          deviceLibraryIdentifier: input.deviceLibraryIdentifier,
        },
      },
    });
    if (existing) {
      await this.prisma.walletDeviceRegistration.update({
        where: { id: existing.id },
        data: { pushToken: input.pushToken },
      });
      return 200;
    }
    await this.prisma.walletDeviceRegistration.create({
      data: {
        walletPassId: pass.id,
        deviceLibraryIdentifier: input.deviceLibraryIdentifier,
        pushToken: input.pushToken,
      },
    });
    return 201;
  }

  async unregisterDevice(input: {
    deviceLibraryIdentifier: string;
    passTypeIdentifier: string;
    serialNumber: string;
    authenticationToken: string;
  }) {
    this.assertPassType(input.passTypeIdentifier);
    const pass = await this.authorizedPass(input.serialNumber, input.authenticationToken);
    await this.prisma.walletDeviceRegistration.deleteMany({
      where: { walletPassId: pass.id, deviceLibraryIdentifier: input.deviceLibraryIdentifier },
    });
  }

  async serialNumbers(deviceLibraryIdentifier: string, passTypeIdentifier: string, passesUpdatedSince?: string) {
    this.assertPassType(passTypeIdentifier);
    const rows = await this.prisma.walletDeviceRegistration.findMany({
      where: { deviceLibraryIdentifier, walletPass: { provider: "APPLE" } },
      include: { walletPass: { include: { card: true } } },
    });
    const since = passesUpdatedSince ? Number(passesUpdatedSince) : Number.NaN;
    const changed = rows.filter((row) => {
      if (Number.isNaN(since)) return true;
      return row.walletPass.card.updatedAt.getTime() / 1000 > since;
    });
    if (!changed.length) return null;
    const last = changed.reduce((max, row) => Math.max(max, row.walletPass.card.updatedAt.getTime()), 0);
    return {
      serialNumbers: changed.map((row) => row.walletPass.serialNumber),
      lastUpdated: String(Math.floor(last / 1000)),
    };
  }

  private assertPassType(passTypeIdentifier: string) {
    const expected = getConfig().apple.passTypeIdentifier;
    if (expected && expected !== passTypeIdentifier) throw new UnauthorizedException();
  }

  private async authorizedPass(serialNumber: string, authenticationToken: string) {
    const pass = await this.prisma.walletPass.findUnique({ where: { serialNumber } });
    if (!pass?.authTokenHash || pass.authTokenHash !== hashToken(authenticationToken)) {
      throw new UnauthorizedException();
    }
    return pass;
  }

  private async prepare(cardId: string) {
    const config = getConfig();
    if (!config.apple.configured) {
      throw new DomainException(HttpStatus.SERVICE_UNAVAILABLE, "WALLET_NOT_CONFIGURED", NOT_CONFIGURED);
    }
    for (const file of [config.apple.wwdrPath, config.apple.signerCertPath, config.apple.signerKeyPath]) {
      if (!fs.existsSync(file)) {
        throw new DomainException(
          HttpStatus.SERVICE_UNAVAILABLE,
          "WALLET_NOT_CONFIGURED",
          `No se encontró el certificado de Apple en ${file}`,
        );
      }
    }
    const card = await this.prisma.loyaltyCard.findUnique({
      where: { id: cardId },
      include: { customer: true, program: true, business: true },
    });
    if (!card) throw new DomainException(HttpStatus.NOT_FOUND, "NOT_FOUND", "No encontramos esa tarjeta");
    let walletPass = await this.prisma.walletPass.findUnique({
      where: { cardId_provider: { cardId, provider: "APPLE" } },
    });
    if (!walletPass) {
      const authenticationToken = generateAppleAuthToken();
      walletPass = await this.prisma.walletPass.create({
        data: {
          cardId,
          provider: "APPLE",
          serialNumber: generateSerialNumber(),
          authTokenHash: hashToken(authenticationToken),
          authTokenEncrypted: encryptSecret(authenticationToken),
        },
      });
    }
    if (!walletPass.authTokenEncrypted) {
      throw new DomainException(HttpStatus.CONFLICT, "PASS_INCOMPLETE", "El pase de Apple no tiene token de actualización");
    }
    return { card, walletPass, config };
  }

  private async sign(loaded: Awaited<ReturnType<ApplePassService["prepare"]>>) {
    const { card, walletPass, config } = loaded;
    const scanToken = decryptSecret(card.publicTokenEncrypted);
    const authenticationToken = decryptSecret(walletPass.authTokenEncrypted!);
    const images = await renderStrip({
      current: card.currentStamps,
      required: card.program.stampsRequired,
      background: card.program.cardBackground,
      accent: card.program.cardLabel,
      icon: card.program.stampIcon,
    });
    const icons = await renderIcons(card.program.cardLabel);
    const logoFile = localLogo(card.business.logoUrl, config.uploadDir);
    const logos = await renderLogos(
      card.business.name,
      card.program.cardForeground,
      card.program.cardBackground,
      logoFile ? fs.readFileSync(logoFile) : undefined,
    );
    const passJson = buildStoreCardPass({
      businessName: card.business.name,
      programName: card.program.name,
      customerName: card.customer.name,
      rewardTitle: card.program.rewardTitle,
      rewardDescription: card.program.rewardDescription,
      current: card.currentStamps,
      required: card.program.stampsRequired,
      rewardAvailable: card.rewardAvailable,
      icon: card.program.stampIcon,
      cycle: card.cycle,
      background: card.program.cardBackground,
      foreground: card.program.cardForeground,
      label: card.program.cardLabel,
      scanToken,
      serialNumber: walletPass.serialNumber,
      authenticationToken,
      passTypeIdentifier: config.apple.passTypeIdentifier,
      teamIdentifier: config.apple.teamIdentifier,
      webServiceURL: config.apple.webServiceUrl,
      hasLogo: Boolean(logoFile),
    });
    const pkpass = new PKPass(
      {
        "pass.json": Buffer.from(JSON.stringify(passJson)),
        "icon.png": icons.icon,
        "icon@2x.png": icons.icon2x,
        "icon@3x.png": icons.icon3x,
        "logo.png": logos.logo,
        "logo@2x.png": logos.logo2x,
        "logo@3x.png": logos.logo3x,
        "strip.png": images.strip,
        "strip@2x.png": images.strip2x,
        "strip@3x.png": images.strip3x,
      },
      {
        wwdr: fs.readFileSync(config.apple.wwdrPath),
        signerCert: fs.readFileSync(config.apple.signerCertPath),
        signerKey: fs.readFileSync(config.apple.signerKeyPath),
        signerKeyPassphrase: config.apple.signerKeyPassphrase || undefined,
      },
    );
    return { buffer: pkpass.getAsBuffer(), updatedAt: card.updatedAt, serialNumber: walletPass.serialNumber };
  }
}

function localLogo(logoUrl: string | null, uploadDir: string) {
  if (!logoUrl) return null;
  const marker = "/api/uploads/";
  const index = logoUrl.indexOf(marker);
  if (index === -1) return null;
  const relative = logoUrl.slice(index + marker.length);
  if (relative.includes("..")) return null;
  const file = path.resolve(uploadDir, relative);
  return fs.existsSync(file) ? file : null;
}
