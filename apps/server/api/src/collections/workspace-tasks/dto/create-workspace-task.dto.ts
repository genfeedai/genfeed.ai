import {
  WORKSPACE_TASK_OUTPUT_TYPES,
  WORKSPACE_TASK_PRIORITIES,
} from '@api/collections/workspace-tasks/schemas/workspace-task.schema';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateWorkspaceTaskDto {
  @IsOptional()
  @IsMongoId()
  @ApiProperty({
    description: 'Optional brand scope for the task',
    required: false,
    type: String,
  })
  brand?: string;

  @IsOptional()
  @IsEnum(WORKSPACE_TASK_OUTPUT_TYPES)
  @ApiProperty({
    description: 'Preferred output type when the user specifies one',
    enum: WORKSPACE_TASK_OUTPUT_TYPES,
    required: false,
  })
  outputType?: (typeof WORKSPACE_TASK_OUTPUT_TYPES)[number];

  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  @ApiProperty({
    description: 'Requested target platforms',
    required: false,
    type: [String],
  })
  platforms?: string[];

  @IsOptional()
  @IsEnum(WORKSPACE_TASK_PRIORITIES)
  @ApiProperty({
    description: 'Task priority within the workspace queue',
    enum: WORKSPACE_TASK_PRIORITIES,
    required: false,
  })
  priority?: (typeof WORKSPACE_TASK_PRIORITIES)[number];

  @IsString()
  @MaxLength(4000)
  @ApiProperty({
    description: 'Natural-language request for the task',
    required: true,
    type: String,
  })
  request!: string;

  @IsOptional()
  @IsString()
  @MaxLength(140)
  @ApiProperty({
    description: 'Optional user-facing task title',
    required: false,
    type: String,
  })
  title?: string;
}
