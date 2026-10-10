import { TURBO_PROJECT_MAX_INPUTS } from '@api/collections/turbo-projects/dto/add-turbo-project-items.dto';
import type { TurboProjectReviewDecision } from '@genfeedai/contracts/interfaces';
import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsString,
} from 'class-validator';

const REVIEW_DECISIONS: readonly TurboProjectReviewDecision[] = [
  'approved',
  'rejected',
];

export class ReviewTurboProjectItemsDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(TURBO_PROJECT_MAX_INPUTS)
  @IsString({ each: true })
  readonly itemIds!: string[];

  @ApiProperty({ enum: REVIEW_DECISIONS })
  @IsIn([...REVIEW_DECISIONS])
  readonly decision!: TurboProjectReviewDecision;
}
