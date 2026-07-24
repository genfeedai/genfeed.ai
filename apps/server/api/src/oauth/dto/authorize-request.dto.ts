import {
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
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

  @IsString()
  @MinLength(16)
  @MaxLength(512)
  state!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  scope?: string;

  @IsString()
  @MaxLength(2048)
  resource!: string;
}
