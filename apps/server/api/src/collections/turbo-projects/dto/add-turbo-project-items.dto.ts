import {
  TURBO_IDEA_FORMATS,
  TURBO_IDEA_MAX_COUNT,
} from '@api/collections/turbo-projects/dto/generate-turbo-ideas.dto';
import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import type { TurboIdeaFormat } from '@genfeedai/contracts/interfaces';
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

/** Workflow projects run at most this many inputs, matching the project runner. */
export const TURBO_PROJECT_MAX_INPUTS = 100;

export class TurboProjectIdeaDto {
  @ApiProperty()
  @IsString()
  @MaxLength(100)
  readonly id!: string;

  @ApiProperty({ enum: TURBO_IDEA_FORMATS })
  @IsIn([...TURBO_IDEA_FORMATS])
  readonly format!: TurboIdeaFormat;

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

export class TurboProjectInputDto {
  @ApiProperty({ description: 'Uploaded image or video ingredient' })
  @IsEntityId()
  readonly ingredientId!: string;
}

export class AddTurboProjectItemsDto {
  @ApiPropertyOptional({
    description: 'Replaces the idea project ideas',
    type: [TurboProjectIdeaDto],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(TURBO_IDEA_MAX_COUNT)
  @ValidateNested({ each: true })
  @Type(() => TurboProjectIdeaDto)
  readonly ideas?: TurboProjectIdeaDto[];

  @ApiPropertyOptional({
    description: 'Appended to the workflow project inputs',
    type: [TurboProjectInputDto],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(TURBO_PROJECT_MAX_INPUTS)
  @ValidateNested({ each: true })
  @Type(() => TurboProjectInputDto)
  readonly inputs?: TurboProjectInputDto[];
}
