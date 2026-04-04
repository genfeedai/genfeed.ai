import {
  WORKSPACE_TASK_REVIEW_STATES,
  WORKSPACE_TASK_STATUSES,
} from '@api/collections/workspace-tasks/schemas/workspace-task.schema';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';

export const WORKSPACE_TASK_VIEWS = ['all', 'inbox', 'in_progress'] as const;

export class WorkspaceTasksQueryDto extends BaseQueryDto {
  @IsOptional()
  @IsEnum(WORKSPACE_TASK_STATUSES)
  @ApiProperty({
    description: 'Filter by task status',
    enum: WORKSPACE_TASK_STATUSES,
    required: false,
  })
  status?: (typeof WORKSPACE_TASK_STATUSES)[number];

  @IsOptional()
  @IsEnum(WORKSPACE_TASK_REVIEW_STATES)
  @ApiProperty({
    description: 'Filter by review state',
    enum: WORKSPACE_TASK_REVIEW_STATES,
    required: false,
  })
  reviewState?: (typeof WORKSPACE_TASK_REVIEW_STATES)[number];

  @IsOptional()
  @IsEnum(WORKSPACE_TASK_VIEWS)
  @ApiProperty({
    description: 'Preset task list view',
    enum: WORKSPACE_TASK_VIEWS,
    required: false,
  })
  view?: (typeof WORKSPACE_TASK_VIEWS)[number];
}
