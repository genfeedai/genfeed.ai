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
  @Min(1)
  @Max(12)
  @ApiProperty({
    default: 6,
    description: 'Number of ideas to generate (1-12)',
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
