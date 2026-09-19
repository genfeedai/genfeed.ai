import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

export class OAuthAuthorizeDecisionDto {
  @IsString()
  @MaxLength(200)
  client_id!: string;

  @IsString()
  @MaxLength(2048)
  redirect_uri!: string;

  @IsString()
  @Length(43, 43)
  @Matches(/^[A-Za-z0-9_-]+$/)
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

  @IsBoolean()
  approved!: boolean;
}
