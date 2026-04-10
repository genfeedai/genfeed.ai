import {
  TASK_PRIORITIES,
  TASK_STATUSES,
} from '@api/collections/tasks/schemas/task.schema';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsMongoId, IsOptional, IsString } from 'class-validator';

export class TaskQueryDto extends BaseQueryDto {
  @IsOptional()
  @IsEnum(TASK_STATUSES)
  @ApiProperty({
    description: 'Filter by task status',
    enum: TASK_STATUSES,
    required: false,
  })
  status?: (typeof TASK_STATUSES)[number];

  @IsOptional()
  @IsEnum(TASK_PRIORITIES)
  @ApiProperty({
    description: 'Filter by task priority',
    enum: TASK_PRIORITIES,
    required: false,
  })
  priority?: (typeof TASK_PRIORITIES)[number];

  @IsOptional()
  @IsString()
  @ApiProperty({
    description: 'Filter by assignee Clerk user ID',
    required: false,
    type: String,
  })
  assigneeUserId?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({
    description: 'Filter by assignee agent ID',
    required: false,
    type: String,
  })
  assigneeAgentId?: string;

  @IsOptional()
  @IsMongoId()
  @ApiProperty({
    description: 'Filter by parent task ID',
    required: false,
    type: String,
  })
  parentId?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({
    description: 'Filter by project ID',
    required: false,
    type: String,
  })
  projectId?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({
    description: 'Filter by goal ID',
    required: false,
    type: String,
  })
  goalId?: string;

  @IsOptional()
  @IsEnum([
    'none',
    'pending_approval',
    'approved',
    'changes_requested',
    'dismissed',
  ])
  @ApiProperty({
    description: 'Filter by review state',
    enum: [
      'none',
      'pending_approval',
      'approved',
      'changes_requested',
      'dismissed',
    ],
    required: false,
  })
  reviewState?: string;

  @IsOptional()
  @IsEnum(['all', 'inbox', 'in_progress'])
  @ApiProperty({
    description: 'Preset view filter',
    enum: ['all', 'inbox', 'in_progress'],
    required: false,
  })
  view?: 'all' | 'inbox' | 'in_progress';
}
