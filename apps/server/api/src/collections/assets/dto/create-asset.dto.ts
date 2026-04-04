import { AssetCategory, AssetParent } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsMongoId, IsOptional, IsString } from 'class-validator';
import type { Types } from 'mongoose';

export class CreateAssetDto {
  @IsMongoId()
  @IsOptional()
  @ApiProperty({ required: false })
  readonly parent?: Types.ObjectId;

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
