import {
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

export class OAuthAuthorizeRequestDto {
  @IsString()
  @MaxLength(200)
  client_id!: string;

  @IsString()
  @MaxLength(2048)
  redirect_uri!: string;

  @IsString()
  @IsIn(['code'])
  response_type!: 'code';

  @IsString()
  @Length(43, 43)
  @Matches(/^[A-Za-z0-9_-]+$/)
  code_challenge!: string;

  @IsString()
  @IsIn(['S256'])
  code_challenge_method!: 'S256';

  /**
   * RFC 6749 §4.1.1 makes `state` RECOMMENDED, not required, and sets no
   * length floor. PKCE `S256` (mandatory above) is the CSRF protection, so
   * PKCE-only clients may omit it (#4553).
   */
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
}
