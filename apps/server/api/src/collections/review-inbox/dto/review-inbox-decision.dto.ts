import {
  type IReviewInboxBatchDecisionRequest,
  type IReviewInboxDecisionRequest,
  REVIEW_INBOX_BATCH_DECISION_MAX_ITEMS,
  type ReviewInboxDecision,
} from '@genfeedai/contracts/interfaces';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

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

export class ReviewInboxBatchDecisionDto
  implements IReviewInboxBatchDecisionRequest
{
  @ApiProperty({
    description: 'Review inbox item ids, as listed by GET /review-inbox',
    example: [
      'mcp_approval:apr-1',
      'workflow_review_gate:exec-1:review-gate-1',
    ],
    maxItems: REVIEW_INBOX_BATCH_DECISION_MAX_ITEMS,
    minItems: 1,
    type: [String],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(REVIEW_INBOX_BATCH_DECISION_MAX_ITEMS)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(512, { each: true })
  itemIds!: string[];

  @ApiProperty({ enum: ['approve', 'reject'] })
  @IsIn(['approve', 'reject'])
  decision!: ReviewInboxDecision;

  @ApiPropertyOptional({
    description: 'Reviewer feedback recorded with every rejection in the batch',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}
