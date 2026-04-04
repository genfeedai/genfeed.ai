import {
  RunActionType,
  RunEventType,
  RunStatus,
  RunSurface,
  RunTrigger,
} from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class CreateRunDto {
  @IsEnum(RunActionType)
  @ApiProperty({
    description: 'Run action type',
    enum: RunActionType,
    enumName: 'RunActionType',
  })
  readonly actionType!: RunActionType;

  @IsEnum(RunSurface)
  @ApiProperty({
    description: 'Surface that initiated the run',
    enum: RunSurface,
    enumName: 'RunSurface',
  })
  readonly surface!: RunSurface;

  @IsEnum(RunTrigger)
  @IsOptional()
  @ApiProperty({
    description: 'How the run was triggered',
    enum: RunTrigger,
    enumName: 'RunTrigger',
    required: false,
  })
  readonly trigger?: RunTrigger;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Idempotency key to dedupe equivalent create requests',
    required: false,
  })
  readonly idempotencyKey?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Optional external correlation ID for tracing',
    required: false,
  })
  readonly correlationId?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Trace ID for cross-surface and cross-service observability',
    required: false,
  })
  readonly traceId?: string;

  @IsObject()
  @IsOptional()
  @ApiProperty({
    description: 'Action input payload',
    required: false,
    type: Object,
  })
  readonly input?: Record<string, unknown>;

  @IsObject()
  @IsOptional()
  @ApiProperty({
    description: 'Additional run metadata',
    required: false,
    type: Object,
  })
  readonly metadata?: Record<string, unknown>;
}

export class UpdateRunDto {
  @IsEnum(RunStatus)
  @IsOptional()
  @ApiProperty({
    description: 'Run status',
    enum: RunStatus,
    enumName: 'RunStatus',
    required: false,
  })
  readonly status?: RunStatus;

  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  @ApiProperty({
    description: 'Run progress percentage',
    required: false,
  })
  readonly progress?: number;

  @IsObject()
  @IsOptional()
  @ApiProperty({
    description: 'Run output payload',
    required: false,
    type: Object,
  })
  readonly output?: Record<string, unknown>;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Error details when run fails',
    required: false,
  })
  readonly error?: string;
}

export class AppendRunEventDto {
  @IsEnum(RunEventType)
  @ApiProperty({
    description: 'Event type name',
    enum: RunEventType,
    enumName: 'RunEventType',
  })
  readonly type!: RunEventType;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Human-readable event message',
    required: false,
  })
  readonly message?: string;

  @IsObject()
  @IsOptional()
  @ApiProperty({
    description: 'Event payload details',
    required: false,
    type: Object,
  })
  readonly payload?: Record<string, unknown>;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Source system for this event (surface/service)',
    required: false,
  })
  readonly source?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Trace ID attached to this specific event',
    required: false,
  })
  readonly traceId?: string;
}

export class RunEventEnvelopeDto {
  @ApiProperty({ description: 'Run identifier' })
  runId!: string;

  @ApiProperty({
    description: 'Trace ID propagated across run lifecycle operations',
  })
  traceId!: string;

  @ApiProperty({
    description: 'Run action type',
    enum: RunActionType,
    enumName: 'RunActionType',
  })
  actionType!: RunActionType;

  @ApiProperty({
    description: 'Surface that initiated the run',
    enum: RunSurface,
    enumName: 'RunSurface',
  })
  surface!: RunSurface;

  @ApiProperty({
    description: 'Current run status at event emission time',
    enum: RunStatus,
    enumName: 'RunStatus',
  })
  status!: RunStatus;

  @ApiProperty({
    description: 'Current run progress at event emission time',
  })
  progress!: number;

  @ApiProperty({
    description: 'Run event payload',
    type: Object,
  })
  event!: Record<string, unknown>;

  @ApiProperty({
    description: 'ISO timestamp for stream event ordering',
  })
  timestamp!: string;
}

export class RunQueryDto {
  @IsEnum(RunStatus)
  @IsOptional()
  @ApiProperty({
    description: 'Filter by run status',
    enum: RunStatus,
    enumName: 'RunStatus',
    required: false,
  })
  readonly status?: RunStatus;

  @IsEnum(RunActionType)
  @IsOptional()
  @ApiProperty({
    description: 'Filter by action type',
    enum: RunActionType,
    enumName: 'RunActionType',
    required: false,
  })
  readonly actionType?: RunActionType;

  @IsEnum(RunSurface)
  @IsOptional()
  @ApiProperty({
    description: 'Filter by initiating surface',
    enum: RunSurface,
    enumName: 'RunSurface',
    required: false,
  })
  readonly surface?: RunSurface;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  @IsOptional()
  @ApiProperty({
    default: 20,
    description: 'Page size',
    required: false,
  })
  readonly limit?: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  @ApiProperty({
    default: 0,
    description: 'Offset from newest record',
    required: false,
  })
  readonly offset?: number;
}
