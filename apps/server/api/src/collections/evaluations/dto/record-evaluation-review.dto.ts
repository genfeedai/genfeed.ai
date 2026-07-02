import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const REVIEW_DECISIONS = [
  'approved',
  'needs_changes',
  'rejected',
  'neutral',
] as const;

export class RecordEvaluationReviewDto {
  @ApiPropertyOptional({
    description: 'Human reviewer score from 0 to 100',
    maximum: 100,
    minimum: 0,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  reviewerScore?: number;

  @ApiPropertyOptional({
    description: 'Human reviewer comment',
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;

  @ApiPropertyOptional({
    description: 'Human review decision',
    enum: REVIEW_DECISIONS,
  })
  @IsOptional()
  @IsIn(REVIEW_DECISIONS)
  decision?: (typeof REVIEW_DECISIONS)[number];

  @ApiPropertyOptional({
    description: 'Reviewer-provided tags',
    maxItems: 20,
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  tags?: string[];
}
