import { IsWebsiteUrl } from '@api/helpers/validation/website-url.validator';
import {
  ORGANIZATION_DESCRIPTION_MAX_LENGTH,
  ORGANIZATION_DESCRIPTION_TOO_LONG_MESSAGE,
  ORGANIZATION_NAME_MAX_LENGTH,
  ORGANIZATION_NAME_REQUIRED_MESSAGE,
  ORGANIZATION_NAME_TOO_LONG_MESSAGE,
  ORGANIZATION_WEBSITE_MAX_LENGTH,
  ORGANIZATION_WEBSITE_TOO_LONG_MESSAGE,
} from '@genfeedai/contracts/constants';
import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Body of `POST /organizations`. Ownership, selection, slug and the default
 * brand are derived server-side from the authenticated user, so the client
 * only names the workspace. Limits are shared with the web form through
 * `@genfeedai/contracts` (`createOrganizationSchema` mirrors this DTO).
 */
export class CreateOrganizationRequestDto {
  @IsString()
  @IsNotEmpty({ message: ORGANIZATION_NAME_REQUIRED_MESSAGE })
  @MaxLength(ORGANIZATION_NAME_MAX_LENGTH, {
    message: ORGANIZATION_NAME_TOO_LONG_MESSAGE,
  })
  @ApiProperty({
    description:
      'The display name of the organization; also names its default brand',
    maxLength: ORGANIZATION_NAME_MAX_LENGTH,
    required: true,
  })
  readonly label!: string;

  @IsOptional()
  @IsString()
  @MaxLength(ORGANIZATION_DESCRIPTION_MAX_LENGTH, {
    message: ORGANIZATION_DESCRIPTION_TOO_LONG_MESSAGE,
  })
  @ApiProperty({
    description: 'Description seeded into the default brand',
    maxLength: ORGANIZATION_DESCRIPTION_MAX_LENGTH,
    required: false,
  })
  readonly description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(ORGANIZATION_WEBSITE_MAX_LENGTH, {
    message: ORGANIZATION_WEBSITE_TOO_LONG_MESSAGE,
  })
  @IsWebsiteUrl()
  @ApiProperty({
    description:
      'Website scanned in the background to fill the default brand ' +
      '(voice, colors, links, system prompt). Bare domains are accepted.',
    example: 'acme.com',
    maxLength: ORGANIZATION_WEBSITE_MAX_LENGTH,
    required: false,
  })
  readonly websiteUrl?: string;
}
