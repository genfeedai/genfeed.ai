import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { AssetCategory, AssetParent } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional } from 'class-validator';

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
  @IsEntityId()
  parent?: string;

  @ApiProperty({
    description: 'Filter by brand ID',
    required: false,
  })
  @IsOptional()
  @IsEntityId()
  brand?: string;

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
