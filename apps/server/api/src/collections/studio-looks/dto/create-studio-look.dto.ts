import type { StudioLookAssetType } from '@genfeedai/interfaces';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

const STUDIO_LOOK_ASSET_TYPES = ['image', 'video'] as const;

export class CreateStudioLookDto {
  @ApiProperty({
    description: 'Display name for this saved Look',
    maxLength: 80,
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsNotEmpty()
  @IsString()
  @MaxLength(80)
  label!: string;

  @ApiProperty({ enum: STUDIO_LOOK_ASSET_TYPES })
  @IsIn(STUDIO_LOOK_ASSET_TYPES)
  assetType!: StudioLookAssetType;

  @ApiProperty({ description: 'Studio preset key', maxLength: 200 })
  @IsString()
  @MaxLength(200)
  promptTemplate!: string;

  @ApiProperty({ description: 'Studio style key', maxLength: 200 })
  @IsString()
  @MaxLength(200)
  style!: string;

  @ApiProperty({ description: 'Studio mood key', maxLength: 200 })
  @IsString()
  @MaxLength(200)
  mood!: string;

  @ApiProperty({ description: 'Studio scene key', maxLength: 200 })
  @IsString()
  @MaxLength(200)
  scene!: string;

  @ApiProperty({ description: 'Studio camera key', maxLength: 200 })
  @IsString()
  @MaxLength(200)
  camera!: string;

  @ApiProperty({ description: 'Studio lens key', maxLength: 200 })
  @IsString()
  @MaxLength(200)
  lens!: string;

  @ApiProperty({ description: 'Studio lighting key', maxLength: 200 })
  @IsString()
  @MaxLength(200)
  lighting!: string;

  @ApiProperty({
    description: 'Studio camera-movement key; accepted only for video Looks',
    maxLength: 200,
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  cameraMovement?: string | null;
}
