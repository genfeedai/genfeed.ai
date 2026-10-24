import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export class ClaimTrialCardDto {
  @IsString()
  @Matches(/^cs_[A-Za-z0-9_]+$/, {
    message: 'sessionId must be a Stripe Checkout session id',
  })
  @ApiProperty({
    description: 'Stripe Checkout setup session the card was saved through',
    example: 'cs_test_a1B2c3',
    required: true,
  })
  readonly sessionId!: string;
}
