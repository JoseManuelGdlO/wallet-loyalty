import { Module } from "@nestjs/common";
import { WalletModule } from "../wallet/wallet.module";
import { BusinessesController } from "./businesses.controller";
import { BusinessesService } from "./businesses.service";
import { UploadsController } from "./uploads.controller";

@Module({
  imports: [WalletModule],
  controllers: [BusinessesController, UploadsController],
  providers: [BusinessesService],
  exports: [BusinessesService],
})
export class BusinessesModule {}
