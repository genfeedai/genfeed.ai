import { LabeledCreateDto } from '@api/shared/dto/base/base.dto';
import {
  WorkflowRecurrenceType,
  WorkflowStatus,
  WorkflowStepCategory,
  WorkflowTrigger,
} from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDate,
  IsEnum,
  IsMongoId,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

// =============================================================================
// VISUAL BUILDER DTOs
// =============================================================================

export class WorkflowNodePositionDto {
  @IsNumber()
  @ApiProperty({ description: 'X coordinate on canvas' })
  readonly x!: number;

  @IsNumber()
  @ApiProperty({ description: 'Y coordinate on canvas' })
  readonly y!: number;
}

export class WorkflowNodeDataDto {
  @IsString()
  @ApiProperty({ description: 'Display label for the node' })
  readonly label!: string;

  @IsObject()
  @IsOptional()
  @ApiProperty({ description: 'Node configuration', required: false })
  readonly config?: Record<string, unknown>;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @ApiProperty({
    description: 'Keys of input variables used by this node',
    required: false,
  })
  readonly inputVariableKeys?: string[];
}

export class WorkflowVisualNodeDto {
  @IsString()
  @ApiProperty({ description: 'Unique node ID' })
  readonly id!: string;

  @IsString()
  @ApiProperty({ description: 'Node type from registry' })
  readonly type!: string;

  @ValidateNested()
  @Type(() => WorkflowNodePositionDto)
  @ApiProperty({ description: 'Node position on canvas' })
  readonly position!: WorkflowNodePositionDto;

  @ValidateNested()
  @Type(() => WorkflowNodeDataDto)
  @ApiProperty({ description: 'Node data and config' })
  readonly data!: WorkflowNodeDataDto;
}

export class WorkflowEdgeDto {
  @IsString()
  @ApiProperty({ description: 'Unique edge ID' })
  readonly id!: string;

  @IsString()
  @ApiProperty({ description: 'Source node ID' })
  readonly source!: string;

  @IsString()
  @ApiProperty({ description: 'Target node ID' })
  readonly target!: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Source handle/port', required: false })
  readonly sourceHandle?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Target handle/port', required: false })
  readonly targetHandle?: string;
}

export class WorkflowInputVariableValidationDto {
  @IsNumber()
  @IsOptional()
  @ApiProperty({ description: 'Minimum value for numbers', required: false })
  readonly min?: number;

  @IsNumber()
  @IsOptional()
  @ApiProperty({ description: 'Maximum value for numbers', required: false })
  readonly max?: number;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @ApiProperty({ description: 'Options for select type', required: false })
  readonly options?: string[];

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Regex pattern for text', required: false })
  readonly pattern?: string;
}

export class WorkflowInputVariableDto {
  @IsString()
  @ApiProperty({ description: 'Variable key (used in node config)' })
  readonly key!: string;

  @IsString()
  @IsEnum([
    'image',
    'video',
    'audio',
    'text',
    'number',
    'select',
    'asset',
    'boolean',
  ])
  @ApiProperty({
    description: 'Variable type',
    enum: [
      'image',
      'video',
      'audio',
      'text',
      'number',
      'select',
      'asset',
      'boolean',
    ],
  })
  readonly type!: string;

  @IsString()
  @ApiProperty({ description: 'Display label' })
  readonly label!: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Help text', required: false })
  readonly description?: string;

  @IsOptional()
  @ApiProperty({ description: 'Default value', required: false })
  readonly defaultValue?: unknown;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    description: 'Whether this variable is required',
    required: false,
  })
  readonly required?: boolean;

  @ValidateNested()
  @Type(() => WorkflowInputVariableValidationDto)
  @IsOptional()
  @ApiProperty({ description: 'Validation rules', required: false })
  readonly validation?: WorkflowInputVariableValidationDto;
}

// =============================================================================
// WORKFLOW STEP DTOs
// =============================================================================

export class WorkflowStepDto {
  @IsString()
  @ApiProperty({ description: 'Unique identifier for this step' })
  readonly id!: string;

  @IsString()
  @ApiProperty({ description: 'Human-readable name for this step' })
  readonly label!: string;

  @IsEnum(WorkflowStepCategory)
  @ApiProperty({
    description: 'Category of workflow step',
    enum: WorkflowStepCategory,
    enumName: 'WorkflowStepCategory',
  })
  readonly category!: WorkflowStepCategory;

  @IsObject()
  @ApiProperty({ description: 'Configuration for this step' })
  readonly config!: Record<string, unknown>;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @ApiProperty({
    description: 'IDs of steps that must complete before this one',
    required: false,
  })
  readonly dependsOn?: string[];
}

export class WorkflowRecurrenceDto {
  @IsEnum(WorkflowRecurrenceType)
  @ApiProperty({
    default: WorkflowRecurrenceType.ONCE,
    description: 'Recurrence frequency',
    enum: WorkflowRecurrenceType,
    enumName: 'WorkflowRecurrenceType',
  })
  readonly category!: WorkflowRecurrenceType;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Timezone (e.g., America/Los_Angeles, Europe/London)',
    example: 'America/Los_Angeles',
    required: false,
  })
  readonly timezone?: string;

  @IsDate()
  @IsOptional()
  @Type(() => Date)
  @ApiProperty({
    description: 'Stop recurring after this date',
    required: false,
  })
  readonly endDate?: Date;
}

export class CreateWorkflowDto extends LabeledCreateDto {
  @IsMongoId()
  @IsOptional()
  @ApiProperty({
    description: 'The user ID who created this workflow',
    required: false,
  })
  readonly user!: string;

  @IsMongoId()
  @IsOptional()
  @ApiProperty({
    description: 'The organization ID that owns this workflow',
    required: false,
  })
  readonly organization!: string;

  @IsArray()
  @IsOptional()
  @ApiProperty({
    description: 'Tags for categorizing the workflow',
    required: false,
  })
  readonly tags?: string[];

  @IsString()
  @ApiProperty({ description: 'Name of the workflow' })
  readonly label!: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Description of the workflow', required: false })
  readonly description?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Template ID if using a predefined workflow',
    required: false,
  })
  readonly templateId?: string;

  @IsEnum(WorkflowTrigger)
  @IsOptional()
  @ApiProperty({
    description: 'When the workflow should trigger',
    enum: WorkflowTrigger,
    enumName: 'WorkflowTrigger',
    required: false,
  })
  readonly trigger?: WorkflowTrigger;

  @IsMongoId()
  @IsOptional()
  @ApiProperty({
    description: 'Source asset that triggered the workflow',
    required: false,
  })
  readonly sourceAsset?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkflowStepDto)
  @IsOptional()
  @ApiProperty({
    description: 'Steps to execute in the workflow',
    required: false,
    type: [WorkflowStepDto],
  })
  readonly steps?: WorkflowStepDto[];

  @IsObject()
  @IsOptional()
  @ApiProperty({
    description: 'Additional metadata for the workflow',
    required: false,
  })
  readonly metadata?: Record<string, unknown>;

  @IsEnum(WorkflowStatus)
  @IsOptional()
  @ApiProperty({
    description: 'Workflow status',
    enum: WorkflowStatus,
    enumName: 'WorkflowStatus',
    required: false,
  })
  readonly status?: WorkflowStatus;

  @IsOptional()
  @ApiProperty({
    description: 'Workflow progress percentage',
    required: false,
  })
  readonly progress?: number;

  @IsOptional()
  @ApiProperty({
    description: 'Number of times this workflow has been executed',
    required: false,
  })
  readonly executionCount?: number;

  @IsOptional()
  @ApiProperty({
    description: 'Last execution timestamp',
    required: false,
  })
  readonly lastExecutedAt?: Date;

  @IsOptional()
  @ApiProperty({
    description: 'Workflow start timestamp',
    required: false,
  })
  readonly startedAt?: Date;

  @IsOptional()
  @ApiProperty({
    description: 'Workflow completion timestamp',
    required: false,
  })
  readonly completedAt?: Date;

  @IsDate()
  @IsOptional()
  @Type(() => Date)
  @ApiProperty({
    description: 'When to first run the workflow (for scheduled workflows)',
    required: false,
  })
  readonly scheduledFor?: Date;

  @ValidateNested()
  @Type(() => WorkflowRecurrenceDto)
  @IsOptional()
  @ApiProperty({
    description: 'Recurrence settings for automated scheduling',
    required: false,
    type: WorkflowRecurrenceDto,
  })
  readonly recurrence?: WorkflowRecurrenceDto;

  // ===========================================================================
  // VISUAL BUILDER FIELDS
  // ===========================================================================

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkflowVisualNodeDto)
  @IsOptional()
  @ApiProperty({
    description: 'Visual nodes on the workflow canvas',
    required: false,
    type: [WorkflowVisualNodeDto],
  })
  readonly nodes?: WorkflowVisualNodeDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkflowEdgeDto)
  @IsOptional()
  @ApiProperty({
    description: 'Connections between nodes',
    required: false,
    type: [WorkflowEdgeDto],
  })
  readonly edges?: WorkflowEdgeDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkflowInputVariableDto)
  @IsOptional()
  @ApiProperty({
    description: 'Input variables that can be customized per run',
    required: false,
    type: [WorkflowInputVariableDto],
  })
  readonly inputVariables?: WorkflowInputVariableDto[];

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Workflow thumbnail URL',
    required: false,
  })
  readonly thumbnail?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Node ID currently selected as the workflow thumbnail source',
    required: false,
  })
  readonly thumbnailNodeId?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description:
      'Cron expression for scheduling (e.g., "0 9 * * *" for 9am daily)',
    required: false,
  })
  readonly schedule?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Timezone for schedule (e.g., "America/New_York")',
    required: false,
  })
  readonly timezone?: string;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    description: 'Whether the schedule is enabled',
    required: false,
  })
  readonly isScheduleEnabled?: boolean;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    description: 'Whether workflow is visible in marketplace',
    required: false,
  })
  readonly isPublic?: boolean;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    description: 'Whether workflow is a reusable template',
    required: false,
  })
  readonly isTemplate?: boolean;
}
