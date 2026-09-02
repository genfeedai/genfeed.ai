import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { AssetCategory, AssetParent } from '@genfeedai/contracts';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString } from 'class-validator';

export class GenerateAssetDto {
  @IsEntityId()
  @ApiProperty({ required: true })
  readonly parentId!: string;

  @IsString()
  @IsEnum(AssetParent)
  @ApiProperty({ enum: AssetParent, enumName: 'AssetParent', required: true })
  readonly parentType!: AssetParent;

  @IsString()
  @IsEnum(AssetCategory)
  @ApiProperty({
    enum: AssetCategory,
    enumName: 'AssetCategory',
    required: true,
  })
  readonly category!: AssetCategory;

  @IsString()
  @ApiProperty({ required: true })
  readonly text!: string;

  @IsString()
  @ApiProperty({ required: true })
  readonly model!: string;
}
