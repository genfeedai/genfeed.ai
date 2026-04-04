import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';

/**
 * DTO for partial workflow execution
 */
export class ExecutePartialDto {
  @IsArray()
  @IsString({ each: true })
  @ApiProperty({
    description: 'Node IDs to execute',
    example: ['node-1', 'node-2'],
    type: [String],
  })
  readonly nodeIds!: string[];

  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    default: true,
    description: 'Whether to skip locked nodes',
    required: false,
  })
  readonly respectLocks?: boolean;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    default: false,
    description: 'Dry run - validate without executing',
    required: false,
  })
  readonly dryRun?: boolean;
}

/**
 * DTO for resuming workflow from a failed run
 */
export class ResumeExecutionDto {
  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    default: true,
    description: 'Whether to skip locked nodes',
    required: false,
  })
  readonly respectLocks?: boolean;
}

/**
 * DTO for approving or rejecting a review-gate pause
 */
export class SubmitApprovalDto {
  @IsString()
  @ApiProperty({
    description: 'Review gate node ID awaiting approval',
    example: 'review-gate-1',
  })
  readonly nodeId!: string;

  @IsBoolean()
  @ApiProperty({
    description: 'Whether the review gate was approved',
    example: true,
  })
  readonly approved!: boolean;

  @IsOptional()
  @IsString()
  @ApiProperty({
    description: 'Optional rejection reason when approval is denied',
    example: 'Rejected by reviewer',
    required: false,
  })
  readonly rejectionReason?: string;
}

/**
 * DTO for credit estimate query
 */
export class CreditEstimateQueryDto {
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @Type(() => String)
  @ApiProperty({
    description: 'Optional node IDs for partial execution estimate',
    required: false,
    type: [String],
  })
  readonly nodeIds?: string[];
}

/**
 * DTO for locking/unlocking nodes
 */
export class LockNodesDto {
  @IsArray()
  @IsString({ each: true })
  @ApiProperty({
    description: 'Node IDs to lock',
    example: ['node-1', 'node-2'],
    type: [String],
  })
  readonly nodeIds!: string[];
}

/**
 * DTO for unlocking nodes
 */
export class UnlockNodesDto {
  @IsArray()
  @IsString({ each: true })
  @ApiProperty({
    description: 'Node IDs to unlock',
    example: ['node-1', 'node-2'],
    type: [String],
  })
  readonly nodeIds!: string[];
}

/**
 * DTO for importing a workflow from JSON (core or cloud format)
 */
export class ImportWorkflowDto {
  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Workflow name (overrides the name in the JSON if provided)',
    required: false,
  })
  readonly name?: string;

  @IsObject()
  @ApiProperty({
    description: 'Workflow JSON in core or cloud format',
  })
  readonly workflow!: Record<string, unknown>;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description:
      'Source format hint: "core" or "cloud". Auto-detected if omitted.',
    enum: ['core', 'cloud'],
    required: false,
  })
  readonly format?: 'core' | 'cloud';
}

/**
 * DTO for AI workflow generation
 */
export class GenerateWorkflowDto {
  @IsString()
  @ApiProperty({
    description: 'Natural language description of the desired workflow',
    example:
      'Create a workflow that generates an image and publishes it to Instagram',
  })
  readonly description!: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @ApiProperty({
    description: 'Target platforms to include in the workflow',
    example: ['instagram', 'tiktok'],
    required: false,
    type: [String],
  })
  readonly targetPlatforms?: string[];
}

/**
 * Credit estimate response
 */
export interface CreditEstimateResponse {
  totalCredits: number;
  breakdown: Array<{
    nodeId: string;
    nodeType: string;
    credits: number;
  }>;
  hasInsufficientCredits: boolean;
  availableCredits: number;
}

/**
 * Execution run response
 */
export interface ExecutionRunResponse {
  runId: string;
  status: string;
  startedAt: Date;
  message: string;
}

/**
 * Execution logs response
 */
export interface ExecutionLogsResponse {
  runId: string;
  workflowId: string;
  status: string;
  nodeResults: Array<{
    nodeId: string;
    status: string;
    error?: string;
    startedAt: Date;
    completedAt?: Date;
    creditsUsed: number;
  }>;
  totalCreditsUsed: number;
  startedAt: Date;
  completedAt?: Date;
}
