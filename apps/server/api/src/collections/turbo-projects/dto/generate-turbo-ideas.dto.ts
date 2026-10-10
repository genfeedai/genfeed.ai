import type { TurboIdeaFormat } from '@genfeedai/contracts/interfaces';
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

/** Canonical set of formats an idea project can fan generation across. */
export const TURBO_IDEA_FORMATS: readonly TurboIdeaFormat[] = [
  'image',
  'video',
  'avatar',
] as const;

/**
 * Idea-count bounds for an idea project. These mirror the UI stepper limits in
 * `TurboIdeasEditor` (the only consumer of this endpoint) so the server
 * rejects counts the UI can never produce, instead of silently accepting 1–12.
 */
export const TURBO_IDEA_MIN_COUNT = 3;
export const TURBO_IDEA_MAX_COUNT = 9;

export class GenerateTurboIdeasDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsIn([...TURBO_IDEA_FORMATS], { each: true })
  @ApiProperty({
    description: 'Content formats to distribute the idea project across',
    enum: TURBO_IDEA_FORMATS,
    isArray: true,
  })
  readonly formats!: TurboIdeaFormat[];

  @IsInt()
  @Min(TURBO_IDEA_MIN_COUNT)
  @Max(TURBO_IDEA_MAX_COUNT)
  @ApiProperty({
    default: 6,
    description: `Number of ideas to generate (${TURBO_IDEA_MIN_COUNT}-${TURBO_IDEA_MAX_COUNT})`,
  })
  readonly count!: number;

  @IsString()
  @IsOptional()
  @MaxLength(300)
  @ApiPropertyOptional({
    description: 'Optional creative angle or theme to steer the project',
    example: 'Black Friday launch',
  })
  readonly angle?: string;
}
