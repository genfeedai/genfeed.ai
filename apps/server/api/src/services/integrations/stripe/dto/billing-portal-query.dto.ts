import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';

export class BillingPortalQueryDto {
  @IsOptional()
  @IsString()
  @Matches(/^\/(?!\/)(?!.*\\)/, {
    message: 'returnPath must be an origin-relative path',
  })
  @ApiProperty({
    description: 'Origin-relative path to return to after leaving Stripe',
    example: '/acme/~/settings/organization/subscription',
    required: false,
  })
  readonly returnPath?: string;
}
