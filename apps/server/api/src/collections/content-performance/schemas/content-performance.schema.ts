import { ContentType, CredentialPlatform } from '@genfeedai/enums';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type ContentPerformanceDocument = ContentPerformance & Document;

export enum PerformanceSource {
  API = 'api',
  MANUAL = 'manual',
  WEBHOOK = 'webhook',
  CSV = 'csv',
}

@Schema({
  collation: { locale: 'en', strength: 1 },
  collection: 'content-performance',
  timestamps: true,
  versionKey: false,
})
export class ContentPerformance {
  _id!: string;

  @Prop({
    index: true,
    ref: 'Organization',
    required: true,
    type: Types.ObjectId,
  })
  organization!: Types.ObjectId;

  @Prop({
    index: true,
    ref: 'Brand',
    required: false,
    type: Types.ObjectId,
  })
  brand?: Types.ObjectId;

  @Prop({
    ref: 'User',
    required: true,
    type: Types.ObjectId,
  })
  user!: Types.ObjectId;

  @Prop({
    ref: 'Post',
    required: false,
    type: Types.ObjectId,
  })
  post?: Types.ObjectId;

  @Prop({
    enum: Object.values(CredentialPlatform),
    index: true,
    required: true,
    type: String,
  })
  platform!: CredentialPlatform;

  @Prop({ required: false, type: String })
  externalPostId?: string;

  @Prop({ index: true, required: false, type: String })
  generationId?: string;

  @Prop({
    ref: 'WorkflowExecution',
    required: false,
    type: Types.ObjectId,
  })
  workflowExecutionId?: Types.ObjectId;

  @Prop({ required: false, type: String })
  promptUsed?: string;

  @Prop({ required: false, type: String })
  hookUsed?: string;

  @Prop({
    enum: Object.values(ContentType),
    required: true,
    type: String,
  })
  contentType!: ContentType;

  // Metrics
  @Prop({ default: 0, type: Number })
  views!: number;

  @Prop({ default: 0, type: Number })
  likes!: number;

  @Prop({ default: 0, type: Number })
  comments!: number;

  @Prop({ default: 0, type: Number })
  shares!: number;

  @Prop({ default: 0, type: Number })
  saves!: number;

  @Prop({ default: 0, type: Number })
  clicks!: number;

  @Prop({ default: 0, type: Number })
  revenue!: number;

  @Prop({ default: 0, type: Number })
  engagementRate!: number;

  @Prop({ default: 0, max: 100, min: 0, type: Number })
  performanceScore!: number;

  @Prop({ required: true, type: Date })
  measuredAt!: Date;

  @Prop({ default: 1, type: Number })
  cycleNumber!: number;

  @Prop({
    default: PerformanceSource.API,
    enum: Object.values(PerformanceSource),
    type: String,
  })
  source!: PerformanceSource;

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;

  createdAt!: Date;
  updatedAt!: Date;
}

export const ContentPerformanceSchema =
  SchemaFactory.createForClass(ContentPerformance);
