import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';
import { CreateTaskDto } from './create-task.dto';

/**
 * Review transitions reachable via `PATCH /tasks/:id`. Setting `reviewState`
 * routes the update to the matching review action (approve/request-changes/
 * dismiss), preserving its side effects (event stream, realtime broadcast,
 * feedback-memory capture) — rather than a plain field write.
 */
export const TASK_REVIEW_STATE_TRANSITIONS = [
  'approved',
  'changes_requested',
  'dismissed',
] as const;

export type TaskReviewStateTransition =
  (typeof TASK_REVIEW_STATE_TRANSITIONS)[number];

export class UpdateTaskDto extends PartialType(CreateTaskDto) {
  @IsOptional()
  @IsBoolean()
  @ApiProperty({
    description: 'Soft delete flag',
    required: false,
    type: Boolean,
  })
  isDeleted?: boolean;

  @IsOptional()
  @IsIn(TASK_REVIEW_STATE_TRANSITIONS)
  @ApiProperty({
    description:
      'Review transition. Routes the update to approve/request-changes/dismiss.',
    enum: TASK_REVIEW_STATE_TRANSITIONS,
    required: false,
  })
  reviewState?: TaskReviewStateTransition;

  @IsOptional()
  @IsString()
  @ApiProperty({
    description: 'Reason recorded when requesting changes or dismissing a task',
    required: false,
  })
  reason?: string;
}
