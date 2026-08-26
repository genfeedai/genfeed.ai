import type { ReviewListeningThemeState } from '@genfeedai/interfaces';
import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

const REVIEW_STATES: ReviewListeningThemeState[] = ['acknowledged', 'deferred'];

export class ReviewListeningThemeDto {
  @ApiProperty({ enum: REVIEW_STATES })
  @IsIn(REVIEW_STATES)
  readonly state!: ReviewListeningThemeState;
}
