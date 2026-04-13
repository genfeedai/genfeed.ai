import { ContentRunSource, ContentRunStatus } from '@genfeedai/enums';
import type {
  ContentRunAnalyticsSummary,
  ContentRunBrief,
  ContentRunPublishContext,
  ContentRunRecommendation,
  ContentRunVariant,
} from '@genfeedai/interfaces';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export interface ContentDraftSnapshot {
  content: string;
  confidence?: number;
  mediaUrls?: string[];
  metadata: Record<string, unknown>;
  platforms: string[];
  skillSlug: string;
  type: string;
}

export type ContentRunDocument = ContentRun & Document;

@Schema({
  collection: 'content-runs',
  timestamps: true,
  versionKey: false,
})
export class ContentRun {
  _id!: string;

  @Prop({
    index: true,
    ref: 'Organization',
    required: true,
    type: Types.ObjectId,
  })
  organization!: Types.ObjectId;

  @Prop({ index: true, ref: 'Brand', required: true, type: Types.ObjectId })
  brand!: Types.ObjectId;

  @Prop({ index: true, required: true, type: String })
  skillSlug!: string;

  @Prop({
    enum: Object.values(ContentRunStatus),
    index: true,
    required: true,
    type: String,
  })
  status!: ContentRunStatus;

  @Prop({ required: true, type: Object })
  input!: Record<string, unknown>;

  @Prop({ required: false, type: Object })
  output?: ContentDraftSnapshot;

  @Prop({ required: false, type: Object })
  brief?: ContentRunBrief;

  @Prop({ default: [], type: [Object] })
  variants!: ContentRunVariant[];

  @Prop({ required: false, type: Object })
  publish?: ContentRunPublishContext;

  @Prop({ required: false, type: Object })
  analyticsSummary?: ContentRunAnalyticsSummary;

  @Prop({ default: [], type: [Object] })
  recommendations!: ContentRunRecommendation[];

  @Prop({ required: false, type: String })
  error?: string;

  @Prop({ required: false, type: Number })
  duration?: number;

  @Prop({ default: 0, required: true, type: Number })
  creditsUsed!: number;

  @Prop({
    enum: Object.values(ContentRunSource),
    required: true,
    type: String,
  })
  source!: ContentRunSource;

  @Prop({ default: false, index: true, type: Boolean })
  isDeleted!: boolean;
}

export const ContentRunSchema = SchemaFactory.createForClass(ContentRun);
