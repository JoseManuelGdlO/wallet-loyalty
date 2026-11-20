import { Type } from "class-transformer";
import {
  IsBoolean,
  IsEmail,
  IsHexColor,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
} from "class-validator";

export class CreateBusinessDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { message: "El identificador público solo admite minúsculas y guiones" })
  slug!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  @MinLength(2)
  adminName!: string;

  @IsEmail({}, { message: "El correo del administrador no es válido" })
  adminEmail!: string;

  @IsString()
  @MinLength(8)
  adminPassword!: string;

  @IsString()
  planCode!: string;

  @IsOptional()
  @IsString()
  branchName?: string;

  @IsOptional()
  @IsHexColor()
  primaryColor?: string;

  @IsOptional()
  @IsHexColor()
  secondaryColor?: string;
}

export class UpdateBusinessDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsHexColor()
  primaryColor?: string;

  @IsOptional()
  @IsHexColor()
  secondaryColor?: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsString()
  logoUrl?: string;
}

export class BusinessStatusDto {
  @IsBoolean()
  active!: boolean;
}

export class CreateBranchDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsString()
  address?: string;
}

export class CreateEmployeeDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsEmail({}, { message: "El correo no es válido" })
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsOptional()
  @IsString()
  branchId?: string;
}

export class CreatePlanDto {
  @IsString()
  code!: string;

  @IsString()
  name!: string;

  @IsString()
  description!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxBusinesses!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxCustomers!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxPrograms!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  monthlyPriceCents!: number;
}

export class PageQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @IsOptional()
  @IsString()
  q?: string;
}
