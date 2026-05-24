import {
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';

export class CreateDesktopAuthCodeDto {
  @IsString()
  @MinLength(32)
  codeChallenge!: string;

  @IsString()
  @IsIn(['S256'])
  codeChallengeMethod!: 'S256';

  @IsString()
  @IsOptional()
  returnTo?: string;

  @IsString()
  @MinLength(16)
  state!: string;
}

export class ExchangeDesktopAuthCodeDto {
  @IsString()
  @MinLength(16)
  code!: string;

  @IsString()
  @MinLength(43)
  @Matches(/^[A-Za-z0-9._~-]+$/)
  codeVerifier!: string;

  @IsString()
  @MinLength(16)
  state!: string;
}
