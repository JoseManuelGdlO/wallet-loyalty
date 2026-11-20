import { Module } from "@nestjs/common";
import { WalletModule } from "../wallet/wallet.module";
import { CustomersService } from "./customers.service";
import { LoyaltyController } from "./loyalty.controller";
import { ProgramsService } from "./programs.service";
import { PublicController } from "./public.controller";
import { StampsService } from "./stamps.service";

@Module({
  imports: [WalletModule],
  controllers: [LoyaltyController, PublicController],
  providers: [ProgramsService, CustomersService, StampsService],
})
export class LoyaltyModule {}
