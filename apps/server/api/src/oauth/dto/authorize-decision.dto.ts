import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]+$/;

export class OAuthAuthorizeDecisionDto {
  @IsString()
  @MaxLength(2048)
  client_id!: string;

  @IsString()
  @MaxLength(2048)
  redirect_uri!: string;

  @IsString()
  @Length(43, 43)
  @Matches(SAFE_IDENTIFIER_PATTERN)
  code_challenge!: string;

  @IsString()
  @IsIn(['S256'])
  code_challenge_method!: 'S256';

  /** Optional, mirroring `OAuthAuthorizeRequestDto.state` (#4553). */
  @IsOptional()
  @IsString()
  @MaxLength(512)
  state?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  scope?: string;

  @IsString()
  @MaxLength(2048)
  resource!: string;

  /** Explicit workspace choice; optional only for a single live membership. */
  @IsOptional()
  @IsString()
  @Length(1, 200)
  organizationId?: string;

  /**
   * The only brand this connection may reach, and its default. Omit to reach
   * every brand in the organization; it must belong to `organizationId` and
   * cannot be combined with `allowOrganizationSwitching`.
   */
  @IsOptional()
  @IsString()
  @Length(1, 200)
  brandId?: string;

  /**
   * Let this connection move between the user's organizations. Honored only
   * when the user belongs to more than one; every switch re-checks membership.
   */
  @IsOptional()
  @IsBoolean()
  allowOrganizationSwitching?: boolean;

  @IsBoolean()
  approved!: boolean;
}
