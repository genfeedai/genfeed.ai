import {
  TASK_LINKED_ENTITY_MODELS,
  TASK_OUTPUT_TYPES,
  TASK_PRIORITIES,
  TASK_STATUSES,
} from '@api/collections/tasks/schemas/task.schema';
import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class LinkedEntityDto {
  @IsEntityId()
  @ApiProperty({
    description: 'Entity ID reference',
    required: true,
    type: String,
  })
  entityId!: string;

  @IsEnum(TASK_LINKED_ENTITY_MODELS)
  @ApiProperty({
    description: 'Entity model name',
    enum: TASK_LINKED_ENTITY_MODELS,
    enumName: 'TaskLinkedEntityModel',
    required: true,
  })
  entityModel!: (typeof TASK_LINKED_ENTITY_MODELS)[number];
}

export class CreateTaskDto {
  @IsString()
  @MaxLength(500)
  @ApiProperty({
    description: 'Task title',
    required: true,
    type: String,
  })
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  @ApiProperty({
    description: 'Detailed task description',
    required: false,
    type: String,
  })
  description?: string;

  @IsOptional()
  @IsEnum(TASK_STATUSES)
  @ApiProperty({
    description: 'Task status',
    enum: TASK_STATUSES,
    required: false,
  })
  status?: (typeof TASK_STATUSES)[number];

  @IsOptional()
  @IsEnum(TASK_PRIORITIES)
  @ApiProperty({
    description: 'Task priority',
    enum: TASK_PRIORITIES,
    required: false,
  })
  priority?: (typeof TASK_PRIORITIES)[number];

  @IsOptional()
  @IsEntityId()
  @ApiProperty({
    description: 'Parent task ID for sub-tasks',
    required: false,
    type: String,
  })
  parentId?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({
    description: 'Project reference ID',
    required: false,
    type: String,
  })
  projectId?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({
    description: 'Goal reference ID',
    required: false,
    type: String,
  })
  goalId?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({
    description: 'Clerk user ID of the assignee',
    required: false,
    type: String,
  })
  assigneeUserId?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({
    description: 'Agent ID of the assignee',
    required: false,
    type: String,
  })
  assigneeAgentId?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LinkedEntityDto)
  @ApiProperty({
    description: 'Linked entities (ingredients, posts, articles, evaluations)',
    required: false,
    type: [LinkedEntityDto],
  })
  linkedEntities?: LinkedEntityDto[];

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  @ApiProperty({
    description: 'AI generation request text',
    required: false,
    type: String,
  })
  request?: string;

  @IsOptional()
  @IsEnum(TASK_OUTPUT_TYPES)
  @ApiProperty({
    description: 'Output type for AI generation',
    enum: TASK_OUTPUT_TYPES,
    required: false,
  })
  outputType?: (typeof TASK_OUTPUT_TYPES)[number];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ApiProperty({
    description: 'Target platforms',
    required: false,
    type: [String],
  })
  platforms?: string[];

  @IsOptional()
  @IsString()
  @ApiProperty({
    description: 'HeyGen avatar ID for facecam tasks',
    required: false,
    type: String,
  })
  heygenAvatarId?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({
    description:
      'Provider-agnostic voice ID for facecam tasks (HeyGen catalog ID, ElevenLabs ID, or Voice document _id)',
    required: false,
    type: String,
  })
  voiceId?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({
    description:
      'Voice provider hint — determines how voiceId is resolved (heygen | elevenlabs | genfeed-ai | hedra)',
    required: false,
    type: String,
  })
  voiceProvider?: string;
}
