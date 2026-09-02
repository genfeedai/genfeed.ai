import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { RssApprovalMode, RssImportPolicy } from '@genfeedai/enums';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateRssSourceDto {
  @ApiProperty({ description: 'Display label', maxLength: 120 })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  label!: string;

  @ApiProperty({ description: 'RSS or Atom feed URL' })
  @IsUrl({ require_tld: false })
  feedUrl!: string;

  @ApiProperty({
    description: 'Destination channels for imported items',
    type: 'array',
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsObject({ each: true })
  @Type(() => Object)
  targetChannels!: Record<string, unknown>[];

  @ApiPropertyOptional({ enum: RssImportPolicy })
  @IsOptional()
  @IsEnum(RssImportPolicy)
  importPolicy?: RssImportPolicy;

  @ApiPropertyOptional({ enum: RssApprovalMode })
  @IsOptional()
  @IsEnum(RssApprovalMode)
  approvalMode?: RssApprovalMode;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  timezone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEntityId()
  brandId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;
}
