import {
  CREATOR_SUBSCRIPTION_MAX_PRICE,
  CREATOR_SUBSCRIPTION_MIN_PRICE,
} from '@genfeedai/contracts/constants';
import type {
  ISubscribeToCreatorRequest,
  IUpdateCreatorSubscriptionPlanRequest,
} from '@genfeedai/contracts/interfaces/billing';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * The signed-in reader subscribing to a creator (#9717). The paying
 * organization and user come from the authenticated request.
 */
export class SubscribeToCreatorDto implements ISubscribeToCreatorRequest {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @ApiProperty({ description: "The creator's public profile handle." })
  readonly handle!: string;
}

/** A creator brand's monthly price in credits. */
export class UpdateCreatorSubscriptionPlanDto
  implements IUpdateCreatorSubscriptionPlanRequest
{
  @IsBoolean()
  @ApiProperty({ description: 'Whether new readers can subscribe.' })
  readonly isEnabled!: boolean;

  @IsInt()
  @Min(CREATOR_SUBSCRIPTION_MIN_PRICE)
  @Max(CREATOR_SUBSCRIPTION_MAX_PRICE)
  @ApiProperty({ description: 'Monthly price in whole credits.', example: 50 })
  readonly monthlyPriceCredits!: number;
}

/** Cancel at the end of the paid period, or undo that. */
export class SetCreatorSubscriptionCancelDto {
  @IsBoolean()
  @ApiProperty({
    description: 'True ends the subscription when the paid period ends.',
  })
  readonly cancelAtPeriodEnd!: boolean;
}
