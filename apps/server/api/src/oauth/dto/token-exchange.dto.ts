import { IsIn, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class OAuthTokenExchangeDto {
  @IsString()
  @IsIn(['authorization_code'])
  grant_type!: 'authorization_code';

  @IsString()
  @MinLength(16)
  @MaxLength(512)
  code!: string;

  @IsString()
  @MaxLength(2048)
  redirect_uri!: string;

  @IsString()
  @MaxLength(200)
  client_id!: string;

  @IsString()
  @MinLength(43)
  @MaxLength(128)
  @Matches(/^[A-Za-z0-9._~-]+$/)
  code_verifier!: string;

  @IsString()
  @MaxLength(2048)
  resource!: string;
}
