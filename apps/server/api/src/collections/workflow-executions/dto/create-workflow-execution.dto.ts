import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import {
  WorkflowExecutionStatus,
  WorkflowExecutionTrigger,
} from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsMongoId,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';
import { Types } from 'mongoose';

export class CreateWorkflowExecutionDto {
  @IsMongoId()
  @ApiProperty({ description: 'Workflow ID to execute' })
  readonly workflow!: Types.ObjectId;

  @IsEnum(WorkflowExecutionTrigger)
  @IsOptional()
  @ApiProperty({
    default: WorkflowExecutionTrigger.MANUAL,
    description: 'What triggered this execution',
    enum: WorkflowExecutionTrigger,
    enumName: 'WorkflowExecutionTrigger',
  })
  readonly trigger?: WorkflowExecutionTrigger;

  @IsObject()
  @IsOptional()
  @ApiProperty({
    description: 'Input values for workflow variables',
    required: false,
  })
  readonly inputValues?: Record<string, unknown>;

  @IsObject()
  @IsOptional()
  @ApiProperty({
    description: 'Additional metadata',
    required: false,
  })
  readonly metadata?: Record<string, unknown>;
}

export class UpdateWorkflowExecutionDto {
  @IsEnum(WorkflowExecutionStatus)
  @IsOptional()
  @ApiProperty({
    description: 'Execution status',
    enum: WorkflowExecutionStatus,
    enumName: 'WorkflowExecutionStatus',
    required: false,
  })
  readonly status?: WorkflowExecutionStatus;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Error message if failed',
    required: false,
  })
  readonly error?: string;
}

export class WorkflowExecutionQueryDto extends BaseQueryDto {
  @IsMongoId()
  @IsOptional()
  @ApiProperty({ description: 'Filter by workflow ID', required: false })
  readonly workflow?: string;

  @IsEnum(WorkflowExecutionStatus)
  @IsOptional()
  @ApiProperty({
    description: 'Filter by status',
    enum: WorkflowExecutionStatus,
    enumName: 'WorkflowExecutionStatus',
    required: false,
  })
  readonly status?: WorkflowExecutionStatus;

  @IsEnum(WorkflowExecutionTrigger)
  @IsOptional()
  @ApiProperty({
    description: 'Filter by trigger type',
    enum: WorkflowExecutionTrigger,
    enumName: 'WorkflowExecutionTrigger',
    required: false,
  })
  readonly trigger?: WorkflowExecutionTrigger;
}
