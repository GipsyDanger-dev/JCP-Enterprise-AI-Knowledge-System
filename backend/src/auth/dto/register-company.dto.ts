import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { BillingCycle } from '@prisma/client';

export class RegisterCompanyDto {
  @ApiProperty({ example: 'PT Sejahtera Abadi', minLength: 2, maxLength: 120 })
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  organizationName!: string;

  @ApiProperty({ example: 'Budi Santoso', minLength: 2, maxLength: 120 })
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  adminName!: string;

  @ApiProperty({ example: 'budi.admin', minLength: 3, maxLength: 80 })
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  @IsString()
  @MinLength(3)
  @MaxLength(80)
  @Matches(/^[a-zA-Z0-9_.-]+$/)
  adminUsername!: string;

  @ApiProperty({ example: 'budi@sejahtera.co.id', maxLength: 254 })
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  @IsEmail()
  @MaxLength(254)
  adminEmail!: string;

  @ApiProperty({ example: 'company-password', minLength: 10, maxLength: 128 })
  @IsString()
  @MinLength(10)
  @MaxLength(128)
  password!: string;

  @ApiProperty({ example: 'company-password', minLength: 10, maxLength: 128 })
  @IsString()
  @MinLength(10)
  @MaxLength(128)
  confirmPassword!: string;

  @ApiProperty({ enum: ['TRIAL', 'SUBSCRIBE'], default: 'TRIAL' })
  @IsIn(['TRIAL', 'SUBSCRIBE'])
  onboardingMode: 'TRIAL' | 'SUBSCRIBE' = 'TRIAL';

  @IsOptional()
  @IsString()
  planSlug = 'starter';

  @IsOptional()
  @IsIn([BillingCycle.MONTHLY, BillingCycle.YEARLY])
  cycle: BillingCycle = BillingCycle.MONTHLY;

  @IsOptional()
  @IsString()
  couponCode?: string;
}
