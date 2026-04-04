import { AssetCategory, AssetParent } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsMongoId, IsString } from 'class-validator';
import type { Types } from 'mongoose';

export class GenerateAssetDto {
  @IsMongoId()
  @ApiProperty({ required: true })
  readonly parent!: Types.ObjectId;

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
