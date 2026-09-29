import { IngredientFormat } from '@genfeedai/contracts';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

/** A storyboard run's shots fit comfortably; bounds the per-create lookups. */
const MAX_SOURCE_VIDEOS = 50;

export class EditorProjectSettingsDto {
  @IsOptional()
  @IsEnum(IngredientFormat)
  @ApiProperty({
    default: IngredientFormat.LANDSCAPE,
    description: 'Video format',
    enum: IngredientFormat,
    required: false,
  })
  readonly format?: IngredientFormat;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @ApiProperty({
    default: 1920,
    description: 'Video width in pixels',
    required: false,
  })
  readonly width?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @ApiProperty({
    default: 1080,
    description: 'Video height in pixels',
    required: false,
  })
  readonly height?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(120)
  @ApiProperty({
    default: 30,
    description: 'Frames per second',
    required: false,
  })
  readonly fps?: number;

  @IsOptional()
  @IsString()
  @ApiProperty({
    default: '#000000',
    description: 'Background color',
    required: false,
  })
  readonly backgroundColor?: string;
}

/**
 * Client body for POST /editor-projects.
 *
 * Ownership (`organizationId` / `userId` / `brandId`) is stamped from the
 * authenticated session in the controller — never required on the request body
 * (required `OrganizationalCreateDto` fields would 400 every Studio create).
 */
export class CreateEditorProjectDto {
  @IsOptional()
  @IsString()
  @ApiProperty({
    default: 'Untitled Project',
    description: 'Project name',
    required: false,
  })
  readonly name?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => EditorProjectSettingsDto)
  @ApiProperty({
    description: 'Project settings',
    required: false,
    type: EditorProjectSettingsDto,
  })
  readonly settings?: EditorProjectSettingsDto;

  @IsOptional()
  @IsArray()
  @ApiProperty({
    description: 'Editor tracks',
    required: false,
  })
  readonly tracks?: unknown[];

  @IsOptional()
  @IsNumber()
  @Min(1)
  @ApiProperty({
    default: 300,
    description: 'Total duration in frames',
    required: false,
  })
  readonly totalDurationFrames?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_SOURCE_VIDEOS)
  @IsString({ each: true })
  @ApiProperty({
    description:
      'Source video ingredient IDs, in timeline order. Each becomes one clip on a single video track.',
    required: false,
    type: [String],
  })
  readonly sourceVideoIds?: string[];
}
