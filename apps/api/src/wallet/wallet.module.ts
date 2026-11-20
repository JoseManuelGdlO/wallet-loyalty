import { Module } from "@nestjs/common";
import { ApplePassService } from "./apple-pass.service";
import { AppleWebController } from "./apple-web.controller";
import { ApnsService } from "./apns.service";
import { GoogleWalletService } from "./google-wallet.service";
import { WalletController } from "./wallet.controller";
import { WalletSyncService } from "./wallet-sync.service";

@Module({
  controllers: [AppleWebController, WalletController],
  providers: [ApplePassService, ApnsService, GoogleWalletService, WalletSyncService],
  exports: [ApplePassService, GoogleWalletService, WalletSyncService],
})
export class WalletModule {}
