import { Injectable } from "@nestjs/common";
import type { WalletSyncState } from "@intelekia/shared";
import { ApnsService } from "./apns.service";
import { GoogleWalletService } from "./google-wallet.service";

export type SyncReport = {
  apple: { status: WalletSyncState; detail: string };
  google: { status: WalletSyncState; detail: string };
};

@Injectable()
export class WalletSyncService {
  constructor(
    private readonly apns: ApnsService,
    private readonly google: GoogleWalletService,
  ) {}

  async sync(cardId: string): Promise<SyncReport> {
    const [apple, google] = await Promise.all([
      this.apns.notify(cardId).catch((error: Error) => ({
        status: "failed" as const,
        detail: error.message || "Falló el aviso a Apple",
      })),
      this.google.updateExisting(cardId).catch((error: Error) => ({
        status: "failed" as const,
        detail: error.message || "Falló la actualización de Google",
      })),
    ]);
    return { apple, google };
  }
}
