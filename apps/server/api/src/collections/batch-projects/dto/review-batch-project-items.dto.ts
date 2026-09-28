import { BATCH_PROJECT_MAX_INPUTS } from '@api/collections/batch-projects/dto/add-batch-project-items.dto';
import type { BatchProjectReviewDecision } from '@genfeedai/contracts/interfaces';
import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsString,
} from 'class-validator';

const REVIEW_DECISIONS: readonly BatchProjectReviewDecision[] = [
  'approved',
  'rejected',
];

export class ReviewBatchProjectItemsDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(BATCH_PROJECT_MAX_INPUTS)
  @IsString({ each: true })
  readonly itemIds!: string[];

  @ApiProperty({ enum: REVIEW_DECISIONS })
  @IsIn([...REVIEW_DECISIONS])
  readonly decision!: BatchProjectReviewDecision;
}
