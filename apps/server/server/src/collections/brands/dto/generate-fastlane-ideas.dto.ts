import type { FastlaneFormat } from '@genfeedai/interfaces';
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

/** Canonical set of formats Fastlane can fan generation across. */
export const FASTLANE_FORMATS: readonly FastlaneFormat[] = [
  'image',
  'video',
  'avatar',
] as const;

/**
 * Idea-count bounds for a Fastlane batch. These mirror the UI stepper limits in
 * `FastlaneIdeaSelector` (the only consumer of this endpoint) so the server
 * rejects counts the UI can never produce, instead of silently accepting 1–12.
 */
export const FASTLANE_MIN_IDEAS = 3;
export const FASTLANE_MAX_IDEAS = 9;

export class GenerateFastlaneIdeasDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsIn([...FASTLANE_FORMATS], { each: true })
  @ApiProperty({
    description: 'Content formats to distribute the idea batch across',
    enum: FASTLANE_FORMATS,
    isArray: true,
  })
  readonly formats!: FastlaneFormat[];

  @IsInt()
  @Min(FASTLANE_MIN_IDEAS)
  @Max(FASTLANE_MAX_IDEAS)
  @ApiProperty({
    default: 6,
    description: `Number of ideas to generate (${FASTLANE_MIN_IDEAS}-${FASTLANE_MAX_IDEAS})`,
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
