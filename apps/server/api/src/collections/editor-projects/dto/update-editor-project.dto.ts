import { CreateEditorProjectDto } from '@api/collections/editor-projects/dto/create-editor-project.dto';
import { EditorProjectStatus } from '@genfeedai/enums';
import { ApiProperty, PartialType } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class UpdateEditorProjectDto extends PartialType(
  CreateEditorProjectDto,
) {
  @IsOptional()
  @IsString()
  @ApiProperty({
    description: 'Project name',
    required: false,
  })
  readonly name?: string;

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
    description: 'Total duration in frames',
    required: false,
  })
  readonly totalDurationFrames?: number;

  @IsOptional()
  @IsEnum(EditorProjectStatus)
  @ApiProperty({
    description: 'Project status',
    enum: EditorProjectStatus,
    required: false,
  })
  readonly status?: EditorProjectStatus;

  @IsOptional()
  @IsString()
  @ApiProperty({
    description: 'Thumbnail URL',
    required: false,
  })
  readonly thumbnailUrl?: string;

  @IsOptional()
  @IsBoolean()
  @ApiProperty({
    description: 'Whether the project is deleted',
    required: false,
  })
  readonly isDeleted?: boolean;
}
