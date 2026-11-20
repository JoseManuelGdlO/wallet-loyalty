import { Body, Controller, Get, Headers, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { AuthUser } from "../common/access";
import { CurrentUser } from "../common/current-user.decorator";
import { Public, Roles } from "../common/decorators";
import { requireIdempotency } from "../common/idempotency";
import { CustomersService } from "./customers.service";
import { AddStampDto, CreateCardDto, LookupCardDto, RedeemDto, RegisterCustomerDto, UpsertProgramDto } from "./dto";
import { ProgramsService } from "./programs.service";
import { StampsService } from "./stamps.service";

@ApiTags("loyalty")
@Controller()
export class LoyaltyController {
  constructor(
    private readonly programs: ProgramsService,
    private readonly customers: CustomersService,
    private readonly stamps: StampsService,
  ) {}

  @ApiBearerAuth()
  @Roles("SUPER_ADMIN", "BUSINESS_ADMIN")
  @Post("loyalty/programs")
  createProgram(@CurrentUser() user: AuthUser, @Body() dto: UpsertProgramDto) {
    return this.programs.create(user, dto);
  }

  @ApiBearerAuth()
  @Get("loyalty/programs")
  listPrograms(@CurrentUser() user: AuthUser) {
    return this.programs.list(user);
  }

  @ApiBearerAuth()
  @Get("loyalty/programs/:id")
  getProgram(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.programs.get(user, id);
  }

  @ApiBearerAuth()
  @Roles("SUPER_ADMIN", "BUSINESS_ADMIN")
  @Patch("loyalty/programs/:id")
  updateProgram(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: UpsertProgramDto) {
    return this.programs.update(user, id, dto);
  }

  @Public()
  @Post("customers/register")
  register(@Body() dto: RegisterCustomerDto) {
    return this.customers.register(dto);
  }

  @ApiBearerAuth()
  @Get("customers")
  listCustomers(
    @CurrentUser() user: AuthUser,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("q") q?: string,
  ) {
    return this.customers.list(user, Number(page) || 1, Math.min(Number(pageSize) || 20, 100), q);
  }

  @ApiBearerAuth()
  @Get("customers/:id")
  getCustomer(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.customers.get(user, id);
  }

  @ApiBearerAuth()
  @Roles("SUPER_ADMIN", "BUSINESS_ADMIN", "EMPLOYEE")
  @Post("loyalty/cards")
  createCard(@CurrentUser() user: AuthUser, @Body() dto: CreateCardDto) {
    return this.customers.issue(user, dto);
  }

  @ApiBearerAuth()
  @Roles("SUPER_ADMIN", "BUSINESS_ADMIN", "EMPLOYEE")
  @Post("loyalty/cards/lookup")
  lookup(@CurrentUser() user: AuthUser, @Body() dto: LookupCardDto) {
    return this.stamps.lookup(user, dto.token);
  }

  @ApiBearerAuth()
  @Get("loyalty/cards/:id")
  getCard(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.stamps.get(user, id);
  }

  @ApiBearerAuth()
  @Roles("SUPER_ADMIN", "BUSINESS_ADMIN", "EMPLOYEE")
  @Post("loyalty/cards/:id/stamps")
  addStamp(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() dto: AddStampDto,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    return this.stamps.addStamp(user, id, { ...dto, idempotencyKey: requireIdempotency(idempotencyKey) });
  }

  @ApiBearerAuth()
  @Get("loyalty/cards/:id/transactions")
  transactions(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.stamps.transactions(user, id);
  }

  @ApiBearerAuth()
  @Roles("SUPER_ADMIN", "BUSINESS_ADMIN")
  @Post("loyalty/cards/:id/rotate-token")
  rotate(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.stamps.rotate(user, id);
  }

  @ApiBearerAuth()
  @Roles("SUPER_ADMIN", "BUSINESS_ADMIN", "EMPLOYEE")
  @Post("loyalty/rewards/redeem")
  redeem(
    @CurrentUser() user: AuthUser,
    @Body() dto: RedeemDto,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    return this.stamps.redeem(user, { ...dto, idempotencyKey: requireIdempotency(idempotencyKey) });
  }

  @ApiBearerAuth()
  @Get("loyalty/rewards/pending")
  pending(@CurrentUser() user: AuthUser) {
    return this.stamps.pendingRewards(user);
  }

  @ApiBearerAuth()
  @Roles("SUPER_ADMIN", "BUSINESS_ADMIN")
  @Post("loyalty/transactions/:id/reverse")
  reverse(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    return this.stamps.reverse(user, id, requireIdempotency(idempotencyKey));
  }
}
