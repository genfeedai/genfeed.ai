import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';

export class CreateTrialCardCheckoutDto {
  @IsOptional()
  @IsString()
  @Matches(/^\/(?!\/)(?!.*\\)/, {
    message: 'returnPath must be an origin-relative path',
  })
  @ApiProperty({
    description: 'Origin-relative path to return to after the card is saved',
    example: '/acme/~/settings/organization/billing',
    required: false,
  })
  readonly returnPath?: string;
}
