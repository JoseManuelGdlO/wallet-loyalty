import { Body, Controller, Delete, Get, Headers, HttpCode, Param, Post, Query, Res } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { IsArray, IsOptional, IsString, MinLength } from "class-validator";
import type { Response } from "express";
import { Public } from "../common/decorators";
import { AuditService } from "../audit/audit.service";
import { ApplePassService } from "./apple-pass.service";

class PushTokenBody {
  @IsString()
  @MinLength(8)
  pushToken!: string;
}

class AppleLogBody {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  logs?: string[];
}

@Public()
@SkipThrottle()
@Controller("wallet/apple")
export class AppleWebController {
  constructor(
    private readonly apple: ApplePassService,
    private readonly audit: AuditService,
  ) {}

  @Post("v1/devices/:deviceLibraryIdentifier/registrations/:passTypeIdentifier/:serialNumber")
  async register(
    @Param("deviceLibraryIdentifier") deviceLibraryIdentifier: string,
    @Param("passTypeIdentifier") passTypeIdentifier: string,
    @Param("serialNumber") serialNumber: string,
    @Headers("authorization") authorization: string | undefined,
    @Body() body: PushTokenBody,
    @Res() response: Response,
  ) {
    const status = await this.apple.registerDevice({
      deviceLibraryIdentifier,
      passTypeIdentifier,
      serialNumber,
      authenticationToken: appleToken(authorization),
      pushToken: body.pushToken || "",
    });
    response.status(status).end();
  }

  @Delete("v1/devices/:deviceLibraryIdentifier/registrations/:passTypeIdentifier/:serialNumber")
  @HttpCode(200)
  async remove(
    @Param("deviceLibraryIdentifier") deviceLibraryIdentifier: string,
    @Param("passTypeIdentifier") passTypeIdentifier: string,
    @Param("serialNumber") serialNumber: string,
    @Headers("authorization") authorization: string | undefined,
    @Res() response: Response,
  ) {
    await this.apple.unregisterDevice({
      deviceLibraryIdentifier,
      passTypeIdentifier,
      serialNumber,
      authenticationToken: appleToken(authorization),
    });
    response.status(200).end();
  }

  @Get("v1/devices/:deviceLibraryIdentifier/registrations/:passTypeIdentifier")
  async list(
    @Param("deviceLibraryIdentifier") deviceLibraryIdentifier: string,
    @Param("passTypeIdentifier") passTypeIdentifier: string,
    @Query("passesUpdatedSince") passesUpdatedSince: string | undefined,
    @Res() response: Response,
  ) {
    const body = await this.apple.serialNumbers(deviceLibraryIdentifier, passTypeIdentifier, passesUpdatedSince);
    if (!body) {
      response.status(204).end();
      return;
    }
    response.status(200).json(body);
  }

  @Get("v1/passes/:passTypeIdentifier/:serialNumber")
  async latest(
    @Param("passTypeIdentifier") passTypeIdentifier: string,
    @Param("serialNumber") serialNumber: string,
    @Headers("authorization") authorization: string | undefined,
    @Headers("if-modified-since") ifModifiedSince: string | undefined,
    @Res() response: Response,
  ) {
    const result = await this.apple.pkpassForSerial(
      serialNumber,
      passTypeIdentifier,
      appleToken(authorization),
      ifModifiedSince,
    );
    if (result.notModified) {
      response.status(304).end();
      return;
    }
    response.status(200);
    response.setHeader("Content-Type", "application/vnd.apple.pkpass");
    response.setHeader("Last-Modified", result.updatedAt.toUTCString());
    response.send(result.buffer);
  }

  @Post("v1/log")
  @HttpCode(200)
  async log(@Body() body: AppleLogBody) {
    const logs = (body.logs || []).slice(0, 20).map((line) => line.slice(0, 500));
    if (logs.length) {
      await this.audit.record({
        action: "APPLE_WALLET_LOG",
        entityType: "WalletPass",
        metadata: { logs },
      });
    }
    return { ok: true };
  }
}

function appleToken(header?: string) {
  const match = /^ApplePass\s+(\S+)$/.exec(header || "");
  return match?.[1] || "";
}
