import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsString } from 'class-validator';

/**
 * Upper bound on `ids`. `bulkApprove` issues one version-pin write plus one
 * row update per draft, so an unbounded array fans out unbounded concurrent
 * writes (and an unbounded `id IN (...)` lookup) from a single request.
 */
export const MAX_BULK_APPROVE_DRAFTS = 100;

export class BulkApproveContentDraftsDto {
  @ApiProperty({
    description: 'Content draft ids to approve',
    maxItems: MAX_BULK_APPROVE_DRAFTS,
    type: [String],
  })
  @IsArray()
  @ArrayMaxSize(MAX_BULK_APPROVE_DRAFTS)
  @IsString({ each: true })
  readonly ids!: string[];
}
