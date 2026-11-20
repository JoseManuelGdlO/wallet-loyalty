import { Module } from "@nestjs/common";
import { BusinessesController } from "./businesses.controller";
import { BusinessesService } from "./businesses.service";
import { UploadsController } from "./uploads.controller";

@Module({
  controllers: [BusinessesController, UploadsController],
  providers: [BusinessesService],
  exports: [BusinessesService],
})
export class BusinessesModule {}
