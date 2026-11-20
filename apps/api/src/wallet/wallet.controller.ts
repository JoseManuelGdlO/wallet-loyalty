import { Body, Controller, Header, Post, Res } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { assertBusinessAccess, type AuthUser } from "../common/access";
import { CurrentUser } from "../common/current-user.decorator";
import { Roles } from "../common/decorators";
import { PrismaService } from "../prisma/prisma.service";
import { IssuePassDto } from "../loyalty/dto";
import { ApplePassService } from "./apple-pass.service";
import { GoogleWalletService } from "./google-wallet.service";

@ApiTags("wallet")
@ApiBearerAuth()
@Roles("SUPER_ADMIN", "BUSINESS_ADMIN", "EMPLOYEE")
@Controller("wallet")
export class WalletController {
  constructor(
    private readonly apple: ApplePassService,
    private readonly google: GoogleWalletService,
    private readonly prisma: PrismaService,
  ) {}

  @Post("apple/passes")
  @Header("Content-Type", "application/vnd.apple.pkpass")
  async applePass(@CurrentUser() user: AuthUser, @Body() dto: IssuePassDto, @Res() response: Response) {
    await this.assertCard(user, dto.cardId);
    const pass = await this.apple.pkpassForCard(dto.cardId);
    response.setHeader("Content-Type", "application/vnd.apple.pkpass");
    response.setHeader("Content-Disposition", `attachment; filename="${pass.serialNumber}.pkpass"`);
    response.send(pass.buffer);
  }

  @Post("google/passes")
  async googlePass(@CurrentUser() user: AuthUser, @Body() dto: IssuePassDto) {
    await this.assertCard(user, dto.cardId);
    return this.google.saveLink(dto.cardId);
  }

  private async assertCard(user: AuthUser, cardId: string) {
    const card = await this.prisma.loyaltyCard.findUnique({ where: { id: cardId } });
    if (!card) {
      const { DomainException } = await import("../common/domain.exception");
      const { HttpStatus } = await import("@nestjs/common");
      throw new DomainException(HttpStatus.NOT_FOUND, "NOT_FOUND", "No encontramos esa tarjeta");
    }
    assertBusinessAccess(user, card);
  }
}
