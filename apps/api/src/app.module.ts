import path from "path";
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { AllExceptionsFilter } from "./common/all-exceptions.filter";
import { JwtAuthGuard } from "./common/jwt-auth.guard";
import { LoggingInterceptor } from "./common/logging.interceptor";
import { RolesGuard } from "./common/roles.guard";
import { AnalyticsModule } from "./analytics/analytics.module";
import { AuditModule } from "./audit/audit.module";
import { AuthModule } from "./auth/auth.module";
import { BusinessesModule } from "./businesses/businesses.module";
import { HealthController } from "./health/health.controller";
import { LoyaltyModule } from "./loyalty/loyalty.module";
import { PrismaModule } from "./prisma/prisma.module";
import { WalletModule } from "./wallet/wallet.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: path.resolve(__dirname, "../../../.env"),
    }),
    ThrottlerModule.forRoot([
      { ttl: 60_000, limit: process.env.NODE_ENV === "test" ? 10_000 : 120 },
    ]),
    PrismaModule,
    AuditModule,
    AuthModule,
    BusinessesModule,
    WalletModule,
    LoyaltyModule,
    AnalyticsModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
