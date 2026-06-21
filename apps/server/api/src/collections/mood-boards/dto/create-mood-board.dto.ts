import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class MoodBoardLayoutItemPositionDto {
  @IsNumber()
  @ApiProperty({ description: 'X coordinate on canvas' })
  readonly x!: number;

  @IsNumber()
  @ApiProperty({ description: 'Y coordinate on canvas' })
  readonly y!: number;
}

export class MoodBoardLayoutItemDto {
  @IsString()
  @ApiProperty({ description: 'Asset ID placed on the board' })
  readonly assetId!: string;

  @ValidateNested()
  @Type(() => MoodBoardLayoutItemPositionDto)
  @ApiProperty({
    description: 'Position of the asset on the canvas',
    type: MoodBoardLayoutItemPositionDto,
  })
  readonly position!: MoodBoardLayoutItemPositionDto;

  @IsNumber()
  @IsOptional()
  @ApiProperty({ description: 'Width of the asset tile', required: false })
  readonly width?: number;

  @IsNumber()
  @IsOptional()
  @ApiProperty({ description: 'Z-index layer for stacking', required: false })
  readonly z?: number;
}

export class CreateMoodBoardDto {
  @IsString()
  @ApiProperty({ description: 'Brand ID this mood board belongs to' })
  readonly brandId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MoodBoardLayoutItemDto)
  @IsOptional()
  @ApiProperty({
    description: 'Canvas layout items',
    required: false,
    type: [MoodBoardLayoutItemDto],
  })
  readonly layout?: MoodBoardLayoutItemDto[];

  @IsObject()
  @IsOptional()
  @ApiProperty({ description: 'Additional metadata', required: false })
  readonly metadata?: Record<string, unknown>;
}
