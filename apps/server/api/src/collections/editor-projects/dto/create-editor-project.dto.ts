import { OrganizationalCreateDto } from '@api/shared/dto/base/base.dto';
import { IngredientFormat } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

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

export class CreateEditorProjectDto extends OrganizationalCreateDto {
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
  @IsString()
  @ApiProperty({
    description: 'Source video ingredient ID',
    required: false,
  })
  readonly sourceVideoId?: string;
}
