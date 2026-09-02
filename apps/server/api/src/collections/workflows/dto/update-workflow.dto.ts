import { CreateWorkflowDto } from '@api/collections/workflows/dto/create-workflow.dto';
import { WorkflowLifecycle } from '@genfeedai/enums';
import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';

/**
 * Update DTO for workflows.
 *
 * Inherits every optional create field, plus lifecycle — the standard
 * `PATCH /workflows/:id` route is the single mutation entry point for the
 * workflow resource after the REST audit collapse (#1354): lifecycle
 * publish/archive, thumbnail, schedule, and marketplace publish/unpublish all
 * flow through here as plain field writes instead of dedicated RPC routes.
 */
export class UpdateWorkflowDto extends PartialType(CreateWorkflowDto) {
  @IsEnum(WorkflowLifecycle)
  @IsOptional()
  @ApiProperty({
    description: 'Lifecycle status (draft / published / archived)',
    enum: WorkflowLifecycle,
    enumName: 'WorkflowLifecycle',
    required: false,
  })
  readonly lifecycle?: WorkflowLifecycle;
}
