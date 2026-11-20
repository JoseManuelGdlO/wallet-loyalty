import { Transform, Type } from "class-transformer";
import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsHexColor,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

const emptyToUndefined = ({ value }: { value: unknown }) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

export class UpsertProgramDto {
  @IsString()
  businessId!: string;

  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  stampsRequired!: number;

  @IsString()
  @MinLength(2)
  rewardTitle!: string;

  @IsOptional()
  @IsString()
  rewardDescription?: string;

  @IsOptional()
  @IsString()
  rewardImageUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  stampIcon?: string;

  @IsHexColor()
  cardBackground!: string;

  @IsHexColor()
  cardForeground!: string;

  @IsHexColor()
  cardLabel!: string;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @IsOptional()
  @IsString()
  status?: "ACTIVE" | "INACTIVE";

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  maxStampsPerDay!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(86400)
  cooldownSeconds!: number;

  @IsBoolean()
  blockWhenRewardAvailable!: boolean;
}

export class RegisterCustomerDto {
  @IsString()
  businessSlug!: string;

  @IsOptional()
  @IsString()
  programId?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsEmail({}, { message: "El correo no es válido" })
  email?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(20)
  phone?: string;

  @Type(() => Number)
  @IsInt()
  formStartedAt!: number;

  @IsOptional()
  @IsString()
  companyWebsite?: string;
}

export class CreateCardDto {
  @IsString()
  customerId!: string;

  @IsString()
  programId!: string;
}

export class AddStampDto {
  @IsString()
  @MinLength(20)
  scanToken!: string;

  @IsOptional()
  @IsString()
  branchId?: string;
}

export class LookupCardDto {
  @IsString()
  @MinLength(20)
  token!: string;
}

export class RedeemDto {
  @IsString()
  cardId!: string;

  @IsOptional()
  @IsString()
  branchId?: string;
}

export class IssuePassDto {
  @IsString()
  cardId!: string;
}
