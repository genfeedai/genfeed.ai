import { PageQueryDto } from '@api/helpers/dto/page-query.dto';
import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import type { PatternType } from '@genfeedai/contracts/interfaces';
import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export const CREATIVE_PATTERN_TYPES = [
  'hook_formula',
  'cta_formula',
  'content_structure',
  'caption_formula',
  'visual_style',
] as const satisfies readonly PatternType[];

export const CREATIVE_PATTERN_SCOPES = ['public', 'private'] as const;

export type CreativePatternScope = (typeof CREATIVE_PATTERN_SCOPES)[number];

export class CreativePatternsQueryDto extends PageQueryDto {
  @ApiProperty({
    description: 'Limit the list to one brand',
    required: false,
  })
  @IsOptional()
  @IsEntityId()
  brandId?: string;

  @ApiProperty({
    description: 'Filter by pattern type',
    enum: CREATIVE_PATTERN_TYPES,
    required: false,
  })
  @IsOptional()
  @IsIn(CREATIVE_PATTERN_TYPES)
  patternType?: PatternType;

  @ApiProperty({
    description: 'Filter by platform',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  platform?: string;

  @ApiProperty({
    description: 'Filter by visibility',
    enum: CREATIVE_PATTERN_SCOPES,
    required: false,
  })
  @IsOptional()
  @IsIn(CREATIVE_PATTERN_SCOPES)
  scope?: CreativePatternScope;
}
