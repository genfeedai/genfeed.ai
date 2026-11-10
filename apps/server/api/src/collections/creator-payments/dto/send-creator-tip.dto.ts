import {
  CREATOR_TIP_MAX_AMOUNT,
  CREATOR_TIP_MESSAGE_MAX_LENGTH,
  CREATOR_TIP_MIN_AMOUNT,
} from '@genfeedai/contracts/constants';
import type { ICreatorTipRequest } from '@genfeedai/contracts/interfaces/billing';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * A tip from the signed-in reader (#9716). The paying organization and user
 * come from the authenticated request, never from the body.
 */
export class SendCreatorTipDto implements ICreatorTipRequest {
  @IsInt()
  @Min(CREATOR_TIP_MIN_AMOUNT)
  @Max(CREATOR_TIP_MAX_AMOUNT)
  @ApiProperty({ description: 'Whole credits to send.', example: 50 })
  readonly amount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  @ApiPropertyOptional({ description: 'Article the tip was sent from.' })
  readonly articleId?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @ApiProperty({ description: "The creator's public profile handle." })
  readonly handle!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @ApiProperty({
    description: 'Client-generated key; a retry with the same key sends once.',
  })
  readonly idempotencyKey!: string;

  @IsOptional()
  @IsString()
  @MaxLength(CREATOR_TIP_MESSAGE_MAX_LENGTH)
  @ApiPropertyOptional({ description: 'Optional note shown to the creator.' })
  readonly message?: string;
}
