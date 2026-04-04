import { ContentPlanItemStatus, ContentPlanItemType } from '@genfeedai/enums';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type ContentPlanItemDocument = ContentPlanItem & Document;

@Schema({ _id: false })
export class PipelineStepConfig {
  @Prop({ required: true, type: String })
  type!: string;

  @Prop({ required: true, type: String })
  model!: string;

  @Prop({ type: String })
  prompt?: string;

  @Prop({ type: String })
  aspectRatio?: string;

  @Prop({ type: Number })
  duration?: number;

  @Prop({ type: String })
  imageUrl?: string;

  @Prop({ type: String })
  voiceId?: string;

  @Prop({ type: String })
  text?: string;
}

@Schema({
  collection: 'content-plan-items',
  timestamps: true,
  versionKey: false,
})
export class ContentPlanItem {
  @Prop({ ref: 'Organization', required: true, type: Types.ObjectId })
  organization!: Types.ObjectId;

  @Prop({ ref: 'ContentPlan', required: true, type: Types.ObjectId })
  plan!: Types.ObjectId;

  @Prop({ ref: 'Brand', required: true, type: Types.ObjectId })
  brand!: Types.ObjectId;

  @Prop({
    default: ContentPlanItemStatus.PENDING,
    enum: Object.values(ContentPlanItemStatus),
    type: String,
  })
  status!: ContentPlanItemStatus;

  @Prop({
    enum: Object.values(ContentPlanItemType),
    required: true,
    type: String,
  })
  type!: ContentPlanItemType;

  @Prop({ required: true, type: String })
  topic!: string;

  @Prop({ type: String })
  prompt?: string;

  @Prop({ default: [], type: [String] })
  platforms!: string[];

  @Prop({ type: Date })
  scheduledAt?: Date;

  @Prop({ type: String })
  skillSlug?: string;

  @Prop({ default: [], type: [PipelineStepConfig] })
  pipelineSteps!: PipelineStepConfig[];

  @Prop({ type: Number })
  confidence?: number;

  @Prop({ type: String })
  contentDraftId?: string;

  @Prop({ type: String })
  error?: string;

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;
}

export const ContentPlanItemSchema =
  SchemaFactory.createForClass(ContentPlanItem);
