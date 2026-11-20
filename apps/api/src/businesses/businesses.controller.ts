import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { AuthUser } from "../common/access";
import { CurrentUser } from "../common/current-user.decorator";
import { Roles } from "../common/decorators";
import { BusinessesService } from "./businesses.service";
import {
  BusinessStatusDto,
  CreateBranchDto,
  CreateBusinessDto,
  CreateEmployeeDto,
  CreatePlanDto,
  UpdateBusinessDto,
} from "./dto";

@ApiTags("businesses")
@ApiBearerAuth()
@Controller()
export class BusinessesController {
  constructor(private readonly businesses: BusinessesService) {}

  @Get("plans")
  plans(@CurrentUser() user: AuthUser) {
    return this.businesses.plans(user);
  }

  @Roles("SUPER_ADMIN")
  @Post("plans")
  createPlan(@CurrentUser() user: AuthUser, @Body() dto: CreatePlanDto) {
    return this.businesses.createPlan(user, dto);
  }

  @Get("businesses")
  list(@CurrentUser() user: AuthUser) {
    return this.businesses.list(user);
  }

  @Roles("SUPER_ADMIN")
  @Post("businesses")
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateBusinessDto) {
    return this.businesses.create(user, dto);
  }

  @Get("businesses/:id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.businesses.get(user, id);
  }

  @Patch("businesses/:id")
  update(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: UpdateBusinessDto) {
    return this.businesses.update(user, id, dto);
  }

  @Roles("SUPER_ADMIN")
  @Patch("businesses/:id/status")
  status(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: BusinessStatusDto) {
    return this.businesses.setStatus(user, id, dto);
  }

  @Get("businesses/:id/branches")
  branches(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.businesses.branches(user, id);
  }

  @Post("businesses/:id/branches")
  addBranch(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: CreateBranchDto) {
    return this.businesses.addBranch(user, id, dto);
  }

  @Get("businesses/:id/employees")
  employees(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.businesses.employees(user, id);
  }

  @Post("businesses/:id/employees")
  addEmployee(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: CreateEmployeeDto) {
    return this.businesses.addEmployee(user, id, dto);
  }
}
