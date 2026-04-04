import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

// =============================================================================
// TYPES
// =============================================================================

export type BatchWorkflowJobDocument = BatchWorkflowJob & Document;

export enum BatchWorkflowJobStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export enum BatchWorkflowItemStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

@Schema({ _id: false, timestamps: false })
export class BatchWorkflowItemOutputSummary {
  @Prop({ required: true, type: String })
  id!: string;

  @Prop({ required: true, type: String })
  category!: string;

  @Prop({ type: String })
  status?: string;

  @Prop({ type: String })
  ingredientUrl?: string;

  @Prop({ type: String })
  thumbnailUrl?: string;
}

export const BatchWorkflowItemOutputSummarySchema =
  SchemaFactory.createForClass(BatchWorkflowItemOutputSummary);

// =============================================================================
// SUB-DOCUMENT: Item
// =============================================================================

@Schema({ _id: true, timestamps: false })
export class BatchWorkflowItem {
  _id!: Types.ObjectId;

  @Prop({ ref: 'Ingredient', required: true, type: Types.ObjectId })
  ingredientId!: Types.ObjectId;

  @Prop({
    default: BatchWorkflowItemStatus.PENDING,
    enum: Object.values(BatchWorkflowItemStatus),
    type: String,
  })
  status!: BatchWorkflowItemStatus;

  @Prop({ ref: 'Ingredient', type: Types.ObjectId })
  outputIngredientId?: Types.ObjectId;

  @Prop({ type: String })
  outputCategory?: string;

  @Prop({ type: BatchWorkflowItemOutputSummarySchema })
  outputSummary?: BatchWorkflowItemOutputSummary;

  @Prop({ type: String })
  executionId?: string;

  @Prop({ type: String })
  error?: string;

  @Prop({ type: Date })
  startedAt?: Date;

  @Prop({ type: Date })
  completedAt?: Date;
}

export const BatchWorkflowItemSchema =
  SchemaFactory.createForClass(BatchWorkflowItem);

// =============================================================================
// MAIN DOCUMENT: BatchWorkflowJob
// =============================================================================

@Schema({ collection: 'batch-workflow-jobs', timestamps: true })
export class BatchWorkflowJob {
  @Prop({ ref: 'Organization', required: true, type: Types.ObjectId })
  organization!: Types.ObjectId;

  @Prop({ ref: 'User', required: true, type: Types.ObjectId })
  user!: Types.ObjectId;

  @Prop({ ref: 'Workflow', required: true, type: Types.ObjectId })
  workflowId!: Types.ObjectId;

  @Prop({
    default: BatchWorkflowJobStatus.PENDING,
    enum: Object.values(BatchWorkflowJobStatus),
    type: String,
  })
  status!: BatchWorkflowJobStatus;

  @Prop({ type: [BatchWorkflowItemSchema] })
  items!: BatchWorkflowItem[];

  @Prop({ default: 0, type: Number })
  totalCount!: number;

  @Prop({ default: 0, type: Number })
  completedCount!: number;

  @Prop({ default: 0, type: Number })
  failedCount!: number;

  createdAt?: Date;
  updatedAt?: Date;
}

export const BatchWorkflowJobSchema =
  SchemaFactory.createForClass(BatchWorkflowJob);

// Indexes
BatchWorkflowJobSchema.index({ organization: 1, status: 1 });
BatchWorkflowJobSchema.index({ workflowId: 1 });
