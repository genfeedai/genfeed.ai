import { randomUUID } from 'node:crypto';
import {
  RunActionType,
  RunAuthType,
  RunStatus,
  RunSurface,
  RunTrigger,
} from '@genfeedai/enums';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type RunDocument = Run & Document;

@Schema({ _id: false })
export class RunEvent {
  @Prop({ required: true, type: String })
  type!: string;

  @Prop({ type: String })
  message?: string;

  @Prop({ type: Object })
  payload?: Record<string, unknown>;

  @Prop({ type: String })
  source?: string;

  @Prop({ index: true, type: String })
  traceId?: string;

  @Prop({ default: Date.now, type: Date })
  createdAt!: Date;
}

@Schema({
  collation: { locale: 'en', strength: 1 },
  collection: 'runs',
  timestamps: true,
  versionKey: false,
})
export class Run {
  _id!: string;

  @Prop({ default: randomUUID, index: true, type: String })
  traceId!: string;

  @Prop({
    enum: Object.values(RunActionType),
    index: true,
    required: true,
    type: String,
  })
  actionType!: RunActionType;

  @Prop({
    enum: Object.values(RunSurface),
    index: true,
    required: true,
    type: String,
  })
  surface!: RunSurface;

  @Prop({
    default: RunStatus.PENDING,
    enum: Object.values(RunStatus),
    index: true,
    type: String,
  })
  status!: RunStatus;

  @Prop({
    default: RunAuthType.CLERK,
    enum: Object.values(RunAuthType),
    type: String,
  })
  authType!: RunAuthType;

  @Prop({
    default: RunTrigger.MANUAL,
    enum: Object.values(RunTrigger),
    type: String,
  })
  trigger!: RunTrigger;

  @Prop({
    index: true,
    ref: 'Organization',
    required: true,
    type: Types.ObjectId,
  })
  organization!: Types.ObjectId;

  @Prop({
    index: true,
    ref: 'User',
    required: true,
    type: Types.ObjectId,
  })
  user!: Types.ObjectId;

  @Prop({ index: true, type: String })
  idempotencyKey?: string;

  @Prop({ index: true, type: String })
  correlationId?: string;

  @Prop({ type: Object })
  input?: Record<string, unknown>;

  @Prop({ type: Object })
  output?: Record<string, unknown>;

  @Prop({ type: Object })
  metadata?: Record<string, unknown>;

  @Prop({ type: String })
  error?: string;

  @Prop({ default: 0, max: 100, min: 0, type: Number })
  progress!: number;

  @Prop({ type: Date })
  startedAt?: Date;

  @Prop({ type: Date })
  completedAt?: Date;

  @Prop({ type: Number })
  durationMs?: number;

  @Prop({ default: [], type: [RunEvent] })
  events!: RunEvent[];

  @Prop({ default: false, index: true, type: Boolean })
  isDeleted!: boolean;
}

export const RunSchema = SchemaFactory.createForClass(Run);
