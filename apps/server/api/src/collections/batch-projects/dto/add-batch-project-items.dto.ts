import { FASTLANE_FORMATS } from '@api/collections/brands/dto/generate-fastlane-ideas.dto';
import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import type { FastlaneFormat } from '@genfeedai/contracts/interfaces';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

/** Workflow batches run at most this many inputs, matching the batch runner. */
export const BATCH_PROJECT_MAX_INPUTS = 100;
/** Idea batches hold at most one full idea set per format. */
export const BATCH_PROJECT_MAX_IDEAS = 27;

export class BatchProjectIdeaDto {
  @ApiProperty()
  @IsString()
  @MaxLength(100)
  readonly id!: string;

  @ApiProperty({ enum: FASTLANE_FORMATS })
  @IsIn([...FASTLANE_FORMATS])
  readonly format!: FastlaneFormat;

  @ApiProperty()
  @IsString()
  @MaxLength(500)
  readonly hook!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(5000)
  readonly caption!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(5000)
  readonly visualPrompt!: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  readonly platformHints!: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  readonly speechText?: string;
}

export class BatchProjectInputDto {
  @ApiProperty({ description: 'Uploaded image or video ingredient' })
  @IsEntityId()
  readonly ingredientId!: string;
}

export class AddBatchProjectItemsDto {
  @ApiPropertyOptional({
    description: 'Replaces the idea batch ideas',
    type: [BatchProjectIdeaDto],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(BATCH_PROJECT_MAX_IDEAS)
  @ValidateNested({ each: true })
  @Type(() => BatchProjectIdeaDto)
  readonly ideas?: BatchProjectIdeaDto[];

  @ApiPropertyOptional({
    description: 'Appended to the workflow batch inputs',
    type: [BatchProjectInputDto],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(BATCH_PROJECT_MAX_INPUTS)
  @ValidateNested({ each: true })
  @Type(() => BatchProjectInputDto)
  readonly inputs?: BatchProjectInputDto[];
}
