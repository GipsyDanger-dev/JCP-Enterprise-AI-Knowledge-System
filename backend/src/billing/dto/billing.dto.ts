import { BillingCycle, DiscountType } from '@prisma/client';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

export class CreatePaymentOrderDto {
  @IsString()
  @MinLength(1)
  planSlug = 'starter';

  @IsEnum(BillingCycle)
  cycle: BillingCycle = BillingCycle.MONTHLY;

  @IsOptional()
  @IsString()
  couponCode?: string;
}

export class UpsertBillingPlanDto {
  @IsString()
  @MinLength(2)
  slug!: string;

  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsInt()
  @Min(1)
  monthlyAmount!: number;

  @IsInt()
  @Min(1)
  yearlyAmount!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxMembers?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpsertCouponDto {
  @IsString()
  @MinLength(2)
  code!: string;

  @IsEnum(DiscountType)
  discountType!: DiscountType;

  @IsInt()
  @Min(1)
  @Max(1000000000)
  value!: number;

  @IsOptional()
  startsAt?: string;

  @IsOptional()
  endsAt?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxRedemptions?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
