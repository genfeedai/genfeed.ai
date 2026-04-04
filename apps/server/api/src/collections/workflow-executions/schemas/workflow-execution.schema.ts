import {
  WorkflowExecutionStatus,
  WorkflowExecutionTrigger,
} from '@genfeedai/enums';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type WorkflowExecutionDocument = WorkflowExecution & Document;

@Schema({ _id: false })
export class WorkflowNodeResult {
  @Prop({ required: true, type: String })
  nodeId!: string;

  @Prop({ required: true, type: String })
  nodeType!: string;

  @Prop({
    default: WorkflowExecutionStatus.PENDING,
    enum: Object.values(WorkflowExecutionStatus),
    type: String,
  })
  status!: WorkflowExecutionStatus;

  @Prop({ type: Object })
  input?: Record<string, unknown>;

  @Prop({ type: Object })
  output?: Record<string, unknown>;

  @Prop({ type: String })
  error?: string;

  @Prop({ type: Date })
  startedAt?: Date;

  @Prop({ type: Date })
  completedAt?: Date;

  @Prop({ default: 0, max: 100, min: 0, type: Number })
  progress?: number;
}

@Schema({
  collation: { locale: 'en', strength: 1 },
  collection: 'workflow-executions',
  timestamps: true,
  versionKey: false,
})
export class WorkflowExecution {
  _id!: string;

  @Prop({
    index: true,
    ref: 'Workflow',
    required: true,
    type: Types.ObjectId,
  })
  workflow!: Types.ObjectId;

  @Prop({
    index: true,
    ref: 'User',
    required: true,
    type: Types.ObjectId,
  })
  user!: Types.ObjectId;

  @Prop({
    index: true,
    ref: 'Organization',
    required: true,
    type: Types.ObjectId,
  })
  organization!: Types.ObjectId;

  @Prop({
    default: WorkflowExecutionStatus.PENDING,
    enum: Object.values(WorkflowExecutionStatus),
    index: true,
    type: String,
  })
  status!: WorkflowExecutionStatus;

  @Prop({
    default: WorkflowExecutionTrigger.MANUAL,
    enum: Object.values(WorkflowExecutionTrigger),
    type: String,
  })
  trigger!: WorkflowExecutionTrigger;

  @Prop({ default: {}, type: Object })
  inputValues!: Record<string, unknown>;

  @Prop({ default: [], type: [WorkflowNodeResult] })
  nodeResults!: WorkflowNodeResult[];

  @Prop({ default: 0, max: 100, min: 0, type: Number })
  progress!: number;

  @Prop({ type: Date })
  startedAt?: Date;

  @Prop({ type: Date })
  completedAt?: Date;

  @Prop({ type: Number })
  durationMs?: number;

  @Prop({ type: String })
  error?: string;

  @Prop({ type: String })
  failedNodeId?: string;

  @Prop({ default: 0, type: Number })
  creditsUsed!: number;

  @Prop({ type: Object })
  metadata?: Record<string, unknown>;

  @Prop({ default: false, index: true, type: Boolean })
  isDeleted!: boolean;
}

export const WorkflowExecutionSchema =
  SchemaFactory.createForClass(WorkflowExecution);
