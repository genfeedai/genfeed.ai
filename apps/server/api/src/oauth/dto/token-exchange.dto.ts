import {
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export type OAuthGrantType = 'authorization_code' | 'refresh_token';

function requiresAuthorizationCode(dto: OAuthTokenExchangeDto): boolean {
  return dto.grant_type === 'authorization_code';
}

function requiresRefreshToken(dto: OAuthTokenExchangeDto): boolean {
  return dto.grant_type === 'refresh_token';
}

export class OAuthTokenExchangeDto {
  @IsString()
  @IsIn(['authorization_code', 'refresh_token'])
  grant_type!: OAuthGrantType;

  @IsString()
  @MaxLength(200)
  client_id!: string;

  @ValidateIf(requiresAuthorizationCode)
  @IsString()
  @MinLength(16)
  @MaxLength(512)
  code?: string;

  @ValidateIf(requiresAuthorizationCode)
  @IsString()
  @MaxLength(2048)
  redirect_uri?: string;

  @ValidateIf(requiresAuthorizationCode)
  @IsString()
  @MinLength(43)
  @MaxLength(128)
  @Matches(/^[A-Za-z0-9._~-]+$/)
  code_verifier?: string;

  @ValidateIf(
    (dto: OAuthTokenExchangeDto) =>
      requiresAuthorizationCode(dto) || dto.resource !== undefined,
  )
  @IsString()
  @MaxLength(2048)
  resource?: string;

  @ValidateIf(requiresRefreshToken)
  @IsString()
  @MinLength(16)
  @MaxLength(512)
  refresh_token?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  scope?: string;
}

export type OAuthAuthorizationCodeGrant = OAuthTokenExchangeDto & {
  code: string;
  code_verifier: string;
  grant_type: 'authorization_code';
  redirect_uri: string;
  resource: string;
};

export type OAuthRefreshTokenGrant = OAuthTokenExchangeDto & {
  grant_type: 'refresh_token';
  refresh_token: string;
};

export function isAuthorizationCodeGrant(
  dto: OAuthTokenExchangeDto,
): dto is OAuthAuthorizationCodeGrant {
  return (
    dto.grant_type === 'authorization_code' &&
    typeof dto.code === 'string' &&
    typeof dto.code_verifier === 'string' &&
    typeof dto.redirect_uri === 'string' &&
    typeof dto.resource === 'string'
  );
}

export function isRefreshTokenGrant(
  dto: OAuthTokenExchangeDto,
): dto is OAuthRefreshTokenGrant {
  return (
    dto.grant_type === 'refresh_token' && typeof dto.refresh_token === 'string'
  );
}
