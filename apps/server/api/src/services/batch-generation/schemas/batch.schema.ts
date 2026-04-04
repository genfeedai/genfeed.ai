import {
  REVIEW_BATCH_ITEM_FORMATS,
  type ReviewBatchItemFormat,
} from '@api/services/batch-generation/constants/review-batch-item-format.constant';
import { BatchItemStatus, BatchStatus } from '@genfeedai/enums';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type BatchDocument = Batch & Document;

@Schema({ _id: false })
export class ContentMixConfig {
  @Prop({ default: 60, type: Number })
  imagePercent!: number;

  @Prop({ default: 25, type: Number })
  videoPercent!: number;

  @Prop({ default: 10, type: Number })
  carouselPercent!: number;

  @Prop({ default: 5, type: Number })
  reelPercent!: number;

  @Prop({ default: 0, type: Number })
  storyPercent!: number;
}

@Schema({ _id: false })
export class ReviewEvent {
  @Prop({
    enum: ['approved', 'rejected', 'request_changes'],
    required: true,
    type: String,
  })
  decision!: 'approved' | 'rejected' | 'request_changes';

  @Prop({ required: false, type: String })
  feedback?: string;

  @Prop({ required: true, type: Date })
  reviewedAt!: Date;
}

@Schema({ _id: true, timestamps: true })
export class BatchItem {
  _id!: string;

  @Prop({
    enum: REVIEW_BATCH_ITEM_FORMATS,
    required: true,
    type: String,
  })
  format!: ReviewBatchItemFormat;

  @Prop({
    default: BatchItemStatus.PENDING,
    enum: Object.values(BatchItemStatus),
    type: String,
  })
  status!: BatchItemStatus;

  @Prop({ required: false, type: String })
  prompt?: string;

  @Prop({ required: false, type: String })
  caption?: string;

  @Prop({ required: false, type: String })
  mediaUrl?: string;

  @Prop({ ref: 'Post', required: false, type: Types.ObjectId })
  postId?: Types.ObjectId;

  @Prop({ required: false, type: String })
  platform?: string;

  @Prop({ required: false, type: Date })
  scheduledDate?: Date;

  @Prop({ required: false, type: String })
  error?: string;

  @Prop({
    enum: ['approved', 'rejected', 'request_changes'],
    required: false,
    type: String,
  })
  reviewDecision?: 'approved' | 'rejected' | 'request_changes';

  @Prop({ required: false, type: String })
  reviewFeedback?: string;

  @Prop({ required: false, type: Date })
  reviewedAt?: Date;

  @Prop({ default: [], type: [ReviewEvent] })
  reviewEvents!: ReviewEvent[];

  @Prop({ required: false, type: String })
  sourceActionId?: string;

  @Prop({ required: false, type: String })
  sourceWorkflowId?: string;

  @Prop({ required: false, type: String })
  sourceWorkflowName?: string;

  @Prop({ required: false, type: String })
  opportunityTopic?: string;

  @Prop({
    enum: ['trend', 'event', 'evergreen'],
    required: false,
    type: String,
  })
  opportunitySourceType?: 'trend' | 'event' | 'evergreen';

  @Prop({ required: false, type: Number })
  gateOverallScore?: number;

  @Prop({ default: [], required: false, type: [String] })
  gateReasons?: string[];

  // Proactive agent engagement fields
  @Prop({ default: 'content', enum: ['content', 'engagement'], type: String })
  type!: string;

  @Prop({ required: false, type: String })
  targetPostId?: string;

  @Prop({ required: false, type: String })
  targetPostUrl?: string;

  @Prop({ required: false, type: String })
  targetAuthor?: string;

  @Prop({ required: false, type: String })
  targetPostContent?: string;
}

@Schema({
  collection: 'batches',
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
  versionKey: false,
})
export class Batch {
  _id!: string;

  @Prop({ ref: 'Organization', required: true, type: Types.ObjectId })
  organization!: Types.ObjectId;

  @Prop({ ref: 'User', required: true, type: Types.ObjectId })
  user!: Types.ObjectId;

  @Prop({ ref: 'Brand', required: true, type: Types.ObjectId })
  brand!: Types.ObjectId;

  @Prop({
    default: BatchStatus.PENDING,
    enum: Object.values(BatchStatus),
    type: String,
  })
  status!: BatchStatus;

  @Prop({ required: true, type: Number })
  totalCount!: number;

  @Prop({ default: 0, type: Number })
  completedCount!: number;

  @Prop({ default: 0, type: Number })
  failedCount!: number;

  @Prop({ type: ContentMixConfig })
  contentMix!: ContentMixConfig;

  @Prop({ default: [], type: [String] })
  platforms!: string[];

  @Prop({ default: [], type: [String] })
  topics!: string[];

  @Prop({ required: false, type: Date })
  dateRangeStart?: Date;

  @Prop({ required: false, type: Date })
  dateRangeEnd?: Date;

  @Prop({ required: false, type: String })
  style?: string;

  @Prop({ default: [], type: [BatchItem] })
  items!: BatchItem[];

  // Proactive agent fields
  @Prop({
    default: 'manual',
    enum: ['manual', 'agent', 'proactive'],
    type: String,
  })
  source!: string;

  @Prop({ ref: 'AgentStrategy', required: false, type: Types.ObjectId })
  agentStrategy?: Types.ObjectId;

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;

  @Prop({ required: false, type: Date })
  completedAt?: Date;
}

export const BatchSchema = SchemaFactory.createForClass(Batch);
