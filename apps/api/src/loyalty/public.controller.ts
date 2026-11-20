import { Controller, Get, Header, Param, Post, Res } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { stampView } from "@intelekia/shared";
import { Public } from "../common/decorators";
import { DomainException } from "../common/domain.exception";
import { HttpStatus } from "@nestjs/common";
import { decryptSecret } from "../common/crypto.util";
import { CustomersService } from "./customers.service";
import { ApplePassService } from "../wallet/apple-pass.service";
import { GoogleWalletService } from "../wallet/google-wallet.service";
import { renderStrip } from "../wallet/stamp-artwork";

@ApiTags("public")
@Public()
@Controller("public")
export class PublicController {
  constructor(
    private readonly customers: CustomersService,
    private readonly apple: ApplePassService,
    private readonly google: GoogleWalletService,
  ) {}

  @Get("businesses/:slug")
  business(@Param("slug") slug: string) {
    return this.customers.publicBusiness(slug);
  }

  @Get("cards/:token")
  async card(@Param("token") token: string) {
    const card = await this.customers.findByToken(token);
    if (!card || card.status !== "ACTIVE" || !card.business.active) {
      throw new DomainException(HttpStatus.NOT_FOUND, "NOT_FOUND", "No encontramos esa tarjeta");
    }
    return {
      businessName: card.business.name,
      businessSlug: card.business.slug,
      logoUrl: card.business.logoUrl,
      customerName: card.customer.name,
      programName: card.program.name,
      rewardTitle: card.program.rewardTitle,
      rewardDescription: card.program.rewardDescription,
      rewardImageUrl: card.program.rewardImageUrl,
      stampIcon: card.program.stampIcon,
      colors: {
        background: card.program.cardBackground,
        foreground: card.program.cardForeground,
        label: card.program.cardLabel,
        primary: card.business.primaryColor,
        secondary: card.business.secondaryColor,
      },
      rewardAvailable: card.rewardAvailable,
      cycle: card.cycle,
      stamps: stampView({
        current: card.currentStamps,
        required: card.program.stampsRequired,
        icon: card.program.stampIcon,
        rewardAvailable: card.rewardAvailable,
      }),
      token,
    };
  }

  @Get("cards/:token/stamp-strip.png")
  @Header("Content-Type", "image/png")
  @Header("Cache-Control", "no-store")
  async strip(@Param("token") token: string, @Res() response: Response) {
    const card = await this.customers.findByToken(token);
    if (!card) {
      throw new DomainException(HttpStatus.NOT_FOUND, "NOT_FOUND", "No encontramos esa tarjeta");
    }
    const image = await renderStrip({
      current: card.currentStamps,
      required: card.program.stampsRequired,
      background: card.program.cardBackground,
      accent: card.program.cardLabel,
      icon: card.program.stampIcon,
    });
    response.setHeader("Content-Type", "image/png");
    response.setHeader("Cache-Control", "no-store");
    response.send(image.strip3x);
  }

  @Get("cards/:token/apple.pkpass")
  async applePass(@Param("token") token: string, @Res() response: Response) {
    const card = await this.owned(token);
    const pass = await this.apple.pkpassForCard(card.id);
    response.setHeader("Content-Type", "application/vnd.apple.pkpass");
    response.setHeader("Content-Disposition", `attachment; filename="${pass.serialNumber}.pkpass"`);
    response.send(pass.buffer);
  }

  @Post("cards/:token/google")
  async googlePass(@Param("token") token: string) {
    const card = await this.owned(token);
    return this.google.saveLink(card.id);
  }

  private async owned(token: string) {
    const card = await this.customers.findByToken(token);
    if (!card) throw new DomainException(HttpStatus.NOT_FOUND, "NOT_FOUND", "No encontramos esa tarjeta");
    decryptSecret(card.publicTokenEncrypted);
    return card;
  }
}
