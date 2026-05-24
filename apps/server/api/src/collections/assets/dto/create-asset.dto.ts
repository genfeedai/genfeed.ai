import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { AssetCategory, AssetParent } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class CreateAssetDto {
  @IsEntityId()
  @IsOptional()
  @ApiProperty({ required: false })
  readonly parent?: string;

  @IsString()
  @IsEnum(AssetParent)
  @ApiProperty({
    enum: AssetParent,
    enumName: 'AssetParent',
    required: true,
  })
  readonly parentModel!: AssetParent;

  @IsString()
  @IsEnum(AssetCategory)
  @ApiProperty({
    enum: AssetCategory,
    enumName: 'AssetCategory',
    required: true,
  })
  readonly category!: AssetCategory;
}
