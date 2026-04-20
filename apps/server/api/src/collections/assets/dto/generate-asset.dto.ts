import { AssetCategory, AssetParent } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsMongoId, IsString } from 'class-validator';

export class GenerateAssetDto {
  @IsMongoId()
  @ApiProperty({ required: true })
  readonly parent!: string;

  @IsString()
  @IsEnum(AssetParent)
  @ApiProperty({ enum: AssetParent, enumName: 'AssetParent', required: true })
  readonly parentModel!: AssetParent;

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
