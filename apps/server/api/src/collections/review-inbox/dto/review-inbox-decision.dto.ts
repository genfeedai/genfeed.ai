import type {
  IReviewInboxDecisionRequest,
  ReviewInboxDecision,
} from '@genfeedai/contracts/interfaces';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class ReviewInboxDecisionDto implements IReviewInboxDecisionRequest {
  @ApiProperty({
    description: 'Review inbox item id, as listed by GET /review-inbox',
    example: 'workflow_review_gate:exec-1:review-gate-1',
  })
  @IsString()
  @MaxLength(512)
  itemId!: string;

  @ApiProperty({ enum: ['approve', 'reject'] })
  @IsIn(['approve', 'reject'])
  decision!: ReviewInboxDecision;

  @ApiPropertyOptional({
    description: 'Reviewer feedback recorded with a rejection',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}
