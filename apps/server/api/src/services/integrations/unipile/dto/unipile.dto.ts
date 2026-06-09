import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsISO8601,
  IsOptional,
  IsString,
  IsUrl,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class ConfigureUnipileDto {
  @IsString()
  @MinLength(1)
  @ApiProperty({ description: 'Unipile dashboard access token.' })
  apiKey!: string;

  @IsString()
  @IsUrl({ require_tld: false, require_protocol: true })
  @ApiProperty({
    description:
      'Unipile DSN base URL. Values without /api/v1 are normalized by the API.',
    example: 'https://api1.unipile.com:13111/api/v1',
  })
  apiBaseUrl!: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional()
  defaultAccountId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ApiPropertyOptional({ isArray: true, type: String })
  allowedAccountIds?: string[];
}

export class UnipileContactDto {
  @IsOptional()
  @IsString()
  @ApiPropertyOptional()
  displayName?: string;

  @IsEmail()
  @ApiProperty()
  identifier!: string;
}

export class SendUnipileEmailDto {
  @IsString()
  @MinLength(1)
  @ApiProperty()
  accountId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => UnipileContactDto)
  @ApiProperty({ isArray: true, type: UnipileContactDto })
  to!: UnipileContactDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UnipileContactDto)
  @ApiPropertyOptional({ isArray: true, type: UnipileContactDto })
  cc?: UnipileContactDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UnipileContactDto)
  @ApiPropertyOptional({ isArray: true, type: UnipileContactDto })
  bcc?: UnipileContactDto[];

  @IsString()
  @ApiProperty()
  subject!: string;

  @IsString()
  @MinLength(1)
  @ApiProperty()
  body!: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional()
  replyTo?: string;
}

export class ListUnipileRecordsQueryDto {
  @IsOptional()
  @IsString()
  @ApiPropertyOptional()
  accountId?: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional()
  cursor?: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional()
  limit?: string;
}

export class ListUnipileEmailsQueryDto extends ListUnipileRecordsQueryDto {
  @IsOptional()
  @IsISO8601()
  @ApiPropertyOptional()
  after?: string;

  @IsOptional()
  @IsISO8601()
  @ApiPropertyOptional()
  before?: string;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  @ApiPropertyOptional()
  metaOnly?: boolean;
}
