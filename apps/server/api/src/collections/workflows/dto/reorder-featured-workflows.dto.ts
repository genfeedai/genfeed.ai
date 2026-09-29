import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { FEATURED_WORKFLOW_LIMIT } from '@genfeedai/contracts/constants';
import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray } from 'class-validator';

/** Body of `PUT /admin/featured-workflows/order` (#5511). */
export class ReorderFeaturedWorkflowsDto {
  @ApiProperty({
    description:
      'Every pinned workflow id in the new Featured order. Must list exactly the current pins; a stale list is refused with 409.',
    maxItems: FEATURED_WORKFLOW_LIMIT,
    type: [String],
  })
  @IsArray()
  @ArrayMaxSize(FEATURED_WORKFLOW_LIMIT)
  @IsEntityId({ each: true })
  readonly workflowIds!: string[];
}
