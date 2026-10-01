import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { AssetCategory, AssetParent } from '@genfeedai/contracts';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsIn, IsOptional, IsString } from 'class-validator';

export class CreateAssetDto {
  @IsEntityId()
  @IsOptional()
  @ApiProperty({ required: false })
  readonly parentId?: string;

  @IsString()
  @IsEnum(AssetParent)
  @ApiProperty({
    enum: AssetParent,
    enumName: 'AssetParent',
    required: true,
  })
  readonly parentType!: AssetParent;

  @IsString()
  @IsIn([AssetCategory.LOGO, AssetCategory.BANNER, AssetCategory.REFERENCE])
  @ApiProperty({
    enum: [AssetCategory.LOGO, AssetCategory.BANNER, AssetCategory.REFERENCE],
    enumName: 'AssetCategory',
    required: true,
  })
  readonly category!: AssetCategory;
}
