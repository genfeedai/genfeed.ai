import { CreateModelDto } from '@api/collections/models/dto/create-model.dto';
import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

/**
 * Registry review transitions reachable via `PATCH /models/:id`. Setting
 * `reviewStatus` routes the update to the matching registry-review service
 * method (approve/reject/legacy) instead of a plain field write. Other stored
 * values (`pending`, `discovered`) are owned by sync jobs, not the API.
 */
export const MODEL_REVIEW_STATUS_TRANSITIONS = [
  'approved',
  'legacy',
  'rejected',
] as const;

export type ModelReviewStatusTransition =
  (typeof MODEL_REVIEW_STATUS_TRANSITIONS)[number];

export class UpdateModelDto extends PartialType(CreateModelDto) {
  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    description: 'Whether the model is marked as deleted',
    required: false,
  })
  readonly isDeleted?: boolean;

  @IsIn(MODEL_REVIEW_STATUS_TRANSITIONS)
  @IsOptional()
  @ApiProperty({
    description:
      'Registry review transition. Routes the update to approve/reject/legacy.',
    enum: MODEL_REVIEW_STATUS_TRANSITIONS,
    required: false,
  })
  readonly reviewStatus?: ModelReviewStatusTransition;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Reason recorded when rejecting a discovered model',
    required: false,
  })
  readonly reason?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Replacement model key or id when marking a model legacy',
    required: false,
  })
  readonly succeededBy?: string;
}
