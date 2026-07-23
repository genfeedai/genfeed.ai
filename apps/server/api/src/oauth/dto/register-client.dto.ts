import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class RegisterOAuthClientDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  redirect_uris!: string[];

  @IsOptional()
  @IsString()
  @MaxLength(100)
  client_name?: string;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(['authorization_code'], { each: true })
  grant_types?: string[];

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(['code'], { each: true })
  response_types?: string[];

  @IsOptional()
  @IsString()
  @IsIn(['none'])
  token_endpoint_auth_method?: string;
}
