import {
  RunActionType,
  RunAuthType,
  RunStatus,
  RunSurface,
  RunTrigger,
} from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';

export class RunEventEntity {
  @ApiProperty()
  type!: string;

  @ApiProperty({ required: false })
  message?: string;

  @ApiProperty({ required: false, type: Object })
  payload?: Record<string, unknown>;

  @ApiProperty({ required: false })
  source?: string;

  @ApiProperty({ required: false })
  traceId?: string;

  @ApiProperty()
  createdAt!: Date;
}

export class RunEntity {
  @ApiProperty()
  _id!: string;

  @ApiProperty()
  traceId!: string;

  @ApiProperty({ enum: RunActionType, enumName: 'RunActionType' })
  actionType!: RunActionType;

  @ApiProperty({ enum: RunSurface, enumName: 'RunSurface' })
  surface!: RunSurface;

  @ApiProperty({ enum: RunStatus, enumName: 'RunStatus' })
  status!: RunStatus;

  @ApiProperty({ enum: RunAuthType, enumName: 'RunAuthType' })
  authType!: RunAuthType;

  @ApiProperty({ enum: RunTrigger, enumName: 'RunTrigger' })
  trigger!: RunTrigger;

  @ApiProperty()
  organization!: string;

  @ApiProperty()
  user!: string;

  @ApiProperty({ required: false })
  idempotencyKey?: string;

  @ApiProperty({ required: false })
  correlationId?: string;

  @ApiProperty({ required: false, type: Object })
  input?: Record<string, unknown>;

  @ApiProperty({ required: false, type: Object })
  output?: Record<string, unknown>;

  @ApiProperty({ required: false, type: Object })
  metadata?: Record<string, unknown>;

  @ApiProperty({ required: false })
  error?: string;

  @ApiProperty()
  progress!: number;

  @ApiProperty({ required: false })
  startedAt?: Date;

  @ApiProperty({ required: false })
  completedAt?: Date;

  @ApiProperty({ required: false })
  durationMs?: number;

  @ApiProperty({ type: [RunEventEntity] })
  events!: RunEventEntity[];

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
