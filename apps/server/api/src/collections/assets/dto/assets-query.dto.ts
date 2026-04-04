import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { AssetCategory, AssetParent } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsMongoId, IsOptional } from 'class-validator';
import type { Types } from 'mongoose';

export class AssetQueryDto extends BaseQueryDto {
  @ApiProperty({
    description: 'Filter by asset category',
    enum: AssetCategory,
    enumName: 'AssetCategory',
    required: false,
  })
  @IsOptional()
  @IsEnum(AssetCategory)
  category?: AssetCategory;

  @ApiProperty({
    description: 'Filter by parent model type',
    enum: AssetParent,
    enumName: 'AssetParent',
    required: false,
  })
  @IsOptional()
  @IsEnum(AssetParent)
  parentModel?: AssetParent;

  @ApiProperty({
    description: 'Filter by parent ID',
    required: false,
  })
  @IsOptional()
  @IsMongoId()
  parent?: Types.ObjectId;

  @ApiProperty({
    description: 'Filter by brand ID',
    required: false,
  })
  @IsOptional()
  @IsMongoId()
  brand?: Types.ObjectId;

  @ApiProperty({
    default: false,
    description:
      'Use lightweight mode (skip expensive lookups for gallery views)',
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
    return Boolean(value);
  })
  lightweight?: boolean;
}
