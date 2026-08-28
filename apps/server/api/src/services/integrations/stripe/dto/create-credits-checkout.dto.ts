import {
  PAYG_CREDITS_PER_USD,
  PAYG_MAX_PURCHASE_USD,
  PAYG_MIN_PURCHASE_USD,
} from '@genfeedai/pricing';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

export class CreateCreditsCheckoutDto {
  @IsInt()
  @Min(PAYG_MIN_PURCHASE_USD * PAYG_CREDITS_PER_USD)
  @Max(PAYG_MAX_PURCHASE_USD * PAYG_CREDITS_PER_USD)
  @Type(() => Number)
  @ApiProperty({
    description: 'Whole Genfeed credits to purchase at the canonical PAYG rate',
    example: 5_000,
    maximum: PAYG_MAX_PURCHASE_USD * PAYG_CREDITS_PER_USD,
    minimum: PAYG_MIN_PURCHASE_USD * PAYG_CREDITS_PER_USD,
    required: true,
  })
  readonly credits!: number;
}
