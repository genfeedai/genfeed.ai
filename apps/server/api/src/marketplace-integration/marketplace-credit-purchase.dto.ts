import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * Pay for a listing with credits. The buyer, their organization and the price
 * come from the signed-in request and the marketplace, never from the body.
 */
export class MarketplaceCreditPurchaseDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @ApiProperty({
    description:
      'Client-generated key for one buying attempt. A retry of the same attempt reuses it and is charged once; start a new attempt with a new key.',
  })
  readonly idempotencyKey!: string;
}
