import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';

const RELATIVE_RETURN_PATH_PATTERN = /^\/(?!\/)(?!.*\\)/;

export class BillingPortalQueryDto {
  @IsOptional()
  @IsString()
  @Matches(RELATIVE_RETURN_PATH_PATTERN, {
    message: 'returnPath must be an origin-relative path',
  })
  @ApiProperty({
    description: 'Origin-relative path to return to after leaving Stripe',
    example: '/acme/~/settings/organization/subscription',
    required: false,
  })
  readonly returnPath?: string;
}
