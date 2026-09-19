import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export type OAuthRevocationTokenTypeHint = 'access_token' | 'refresh_token';

/** RFC 7009 §2.1 token revocation request for a public client. */
export class OAuthRevokeTokenDto {
  @IsString()
  @MinLength(16)
  @MaxLength(512)
  token!: string;

  @IsOptional()
  @IsIn(['access_token', 'refresh_token'])
  token_type_hint?: OAuthRevocationTokenTypeHint;

  @IsString()
  @MaxLength(200)
  client_id!: string;
}
