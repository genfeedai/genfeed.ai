import { ContentDraftStatus } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

/**
 * Body for `PATCH /content-drafts/:id`. Consolidates the former approve/reject/
 * edit action routes: setting `status` runs the review transition (approve sets
 * the approver; reject records an optional `reason`); `content` edits the draft.
 * Only the two review transitions are reachable — other statuses are owned by
 * the content engine, not the API.
 */
const CONTENT_DRAFT_REVIEW_STATUSES = [
  ContentDraftStatus.APPROVED,
  ContentDraftStatus.REJECTED,
] as const;

export type ContentDraftReviewStatus =
  (typeof CONTENT_DRAFT_REVIEW_STATUSES)[number];

export class PatchContentDraftDto {
  @IsOptional()
  @IsIn(CONTENT_DRAFT_REVIEW_STATUSES)
  @ApiProperty({
    description: 'Review transition: approve or reject the draft.',
    enum: CONTENT_DRAFT_REVIEW_STATUSES,
    required: false,
  })
  readonly status?: ContentDraftReviewStatus;

  @IsOptional()
  @IsString()
  @ApiProperty({ description: 'Replacement draft content.', required: false })
  readonly content?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({
    description: 'Reason recorded when rejecting the draft.',
    required: false,
  })
  readonly reason?: string;
}
