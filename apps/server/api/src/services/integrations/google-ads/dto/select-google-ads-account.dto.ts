import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

/** A Google Ads customer id, with or without dashes (123-456-7890). */
const GOOGLE_ADS_CUSTOMER_ID_PATTERN = /^\d{3}-?\d{3}-?\d{4}$/;

export class SelectGoogleAdsAccountDto {
  @ApiProperty({
    description: 'Customer id from the accounts list.',
    required: true,
    type: String,
  })
  @IsString()
  @Matches(GOOGLE_ADS_CUSTOMER_ID_PATTERN)
  readonly customerId!: string;
}
