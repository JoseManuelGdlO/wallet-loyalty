import { Injectable } from "@nestjs/common";
import fs from "fs";
import http2 from "http2";
import type { WalletSyncState } from "@intelekia/shared";
import { getConfig } from "../config/configuration";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class ApnsService {
  constructor(private readonly prisma: PrismaService) {}

  async notify(cardId: string): Promise<{ status: WalletSyncState; detail: string }> {
    const config = getConfig();
    if (!config.apple.configured) {
      return { status: "not_configured", detail: "Apple Wallet no tiene certificados. No se envió un push." };
    }
    const pass = await this.prisma.walletPass.findUnique({
      where: { cardId_provider: { cardId, provider: "APPLE" } },
      include: { devices: true },
    });
    if (!pass) return { status: "not_issued", detail: "El cliente todavía no descarga el pase de Apple" };
    if (!pass.devices.length) {
      return { status: "no_devices", detail: "Ningún dispositivo ha registrado el pase para recibir actualizaciones" };
    }
    const cert = fs.readFileSync(config.apple.signerCertPath);
    const key = fs.readFileSync(config.apple.signerKeyPath);
    let pushed = 0;
    const reasons: string[] = [];
    for (const device of pass.devices) {
      const result = await sendPassUpdate({
        pushToken: device.pushToken,
        topic: config.apple.passTypeIdentifier,
        cert,
        key,
        passphrase: config.apple.signerKeyPassphrase,
      });
      if (result.ok) {
        pushed += 1;
        continue;
      }
      reasons.push(result.reason);
      if (result.invalidToken) {
        await this.prisma.walletDeviceRegistration.delete({ where: { id: device.id } }).catch(() => undefined);
      }
    }
    if (pushed > 0) return { status: "pushed", detail: `APNs aceptó el aviso para ${pushed} dispositivo(s)` };
    return { status: "failed", detail: reasons[0] || "APNs rechazó el aviso" };
  }
}

function sendPassUpdate(input: {
  pushToken: string;
  topic: string;
  cert: Buffer;
  key: Buffer;
  passphrase?: string;
}) {
  return new Promise<{ ok: boolean; reason: string; invalidToken: boolean }>((resolve) => {
    const client = http2.connect("https://api.push.apple.com", {
      cert: input.cert,
      key: input.key,
      passphrase: input.passphrase || undefined,
    });
    const finish = (result: { ok: boolean; reason: string; invalidToken: boolean }) => {
      client.close();
      resolve(result);
    };
    client.on("error", (error) => finish({ ok: false, reason: error.message, invalidToken: false }));
    const request = client.request({
      ":method": "POST",
      ":path": `/3/device/${input.pushToken}`,
      "apns-topic": input.topic,
      "apns-push-type": "background",
      "apns-priority": "5",
    });
    let status = 0;
    let body = "";
    request.setEncoding("utf8");
    request.on("response", (headers) => {
      status = Number(headers[":status"] || 0);
    });
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      const invalidToken = status === 410 || body.includes("BadDeviceToken") || body.includes("Unregistered");
      finish({
        ok: status === 200,
        reason: body || `APNs respondió ${status}`,
        invalidToken,
      });
    });
    request.on("error", (error) => finish({ ok: false, reason: error.message, invalidToken: false }));
    request.end("{}");
  });
}
