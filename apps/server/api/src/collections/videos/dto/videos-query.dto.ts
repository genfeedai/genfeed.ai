import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { AssetScope } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsMongoId,
  IsOptional,
  IsString,
} from 'class-validator';

export class VideosQueryDto extends BaseQueryDto {
  @ApiProperty({
    description:
      'Filter by status using repeated query keys (e.g., ?status=completed&status=failed). ' +
      'Defaults to ["draft", "uploaded", "completed"] when not specified.',
    example: ['completed', 'failed'],
    required: false,
    type: [String],
  })
  @Transform(({ value }) => {
    if (!value) {
      return undefined;
    }
    if (Array.isArray(value)) {
      return value;
    }
    return [value];
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  status?: string[];

  @ApiProperty({
    description: 'Filter by training ID',
    required: false,
  })
  @IsOptional()
  @IsMongoId()
  training?: string;

  @ApiProperty({
    description: 'Filter by scope/visibility level',
    enum: AssetScope,
    enumName: 'AssetScope',
    required: false,
  })
  @IsOptional()
  @IsEnum(AssetScope)
  scope?: AssetScope;

  @ApiProperty({
    description: 'Filter by brand ID',
    required: false,
  })
  @IsOptional()
  @IsMongoId()
  brand?: string;

  @ApiProperty({
    description: 'Filter by reference video ID',
    required: false,
  })
  @IsOptional()
  @IsMongoId()
  reference?: string;

  @ApiProperty({
    description: 'Filter by video format',
    required: false,
  })
  @IsOptional()
  @IsString()
  format?: string;

  @ApiProperty({
    description: 'Filter by parent video ID',
    required: false,
  })
  @IsOptional()
  @IsMongoId()
  parent?: string;

  @ApiProperty({
    description: 'Filter by folder ID',
    required: false,
  })
  @IsOptional()
  @IsMongoId()
  folder?: string;

  @ApiProperty({
    description: 'Filter by provider',
    required: false,
  })
  @IsOptional()
  @IsString()
  provider?: string;

  @ApiProperty({
    description: 'Search videos by text',
    required: false,
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({
    default: false,
    description:
      'Use lightweight mode (skip expensive lookups for masonry/gallery views)',
    required: false,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null) {
      return false;
    }
    if (value === 'true' || value === true) {
      return true;
    }
    if (value === 'false' || value === false) {
      return false;
    }
    if (value === '0' || value === 0) {
      return false;
    }
    if (value === '') {
      return false;
    }
    return Boolean(value);
  })
  lightweight?: boolean;
}
