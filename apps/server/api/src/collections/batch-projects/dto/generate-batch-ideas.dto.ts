import type { BatchIdeaFormat } from '@genfeedai/contracts/interfaces';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/** Canonical set of formats an idea batch can fan generation across. */
export const BATCH_IDEA_FORMATS: readonly BatchIdeaFormat[] = [
  'image',
  'video',
  'avatar',
] as const;

/**
 * Idea-count bounds for an idea batch. These mirror the UI stepper limits in
 * `BatchIdeasEditor` (the only consumer of this endpoint) so the server
 * rejects counts the UI can never produce, instead of silently accepting 1–12.
 */
export const BATCH_IDEA_MIN_COUNT = 3;
export const BATCH_IDEA_MAX_COUNT = 9;

export class GenerateBatchIdeasDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsIn([...BATCH_IDEA_FORMATS], { each: true })
  @ApiProperty({
    description: 'Content formats to distribute the idea batch across',
    enum: BATCH_IDEA_FORMATS,
    isArray: true,
  })
  readonly formats!: BatchIdeaFormat[];

  @IsInt()
  @Min(BATCH_IDEA_MIN_COUNT)
  @Max(BATCH_IDEA_MAX_COUNT)
  @ApiProperty({
    default: 6,
    description: `Number of ideas to generate (${BATCH_IDEA_MIN_COUNT}-${BATCH_IDEA_MAX_COUNT})`,
  })
  readonly count!: number;

  @IsString()
  @IsOptional()
  @MaxLength(300)
  @ApiPropertyOptional({
    description: 'Optional creative angle or theme to steer the batch',
    example: 'Black Friday launch',
  })
  readonly angle?: string;
}
