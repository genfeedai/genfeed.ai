import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export enum ContentDraftStatus {
  APPROVED = 'approved',
  PENDING = 'pending',
  PUBLISHED = 'published',
  REJECTED = 'rejected',
}

export type ContentDraftDocument = ContentDraft & Document;

@Schema({ collection: 'content-drafts', timestamps: true })
export class ContentDraft {
  @Prop({ ref: 'Organization', required: true, type: Types.ObjectId })
  organization!: Types.ObjectId;

  @Prop({ ref: 'Brand', required: true, type: Types.ObjectId })
  brand!: Types.ObjectId;

  @Prop({ required: true, type: String })
  skillSlug!: string;

  @Prop({ ref: 'Run', type: Types.ObjectId })
  contentRunId?: Types.ObjectId;

  @Prop({ required: true, type: String })
  type!: string;

  @Prop({ required: true, type: String })
  content!: string;

  @Prop({ default: [], type: [String] })
  mediaUrls!: string[];

  @Prop({ default: [], type: [String] })
  platforms!: string[];

  @Prop({ default: {}, type: Object })
  metadata!: Record<string, unknown>;

  @Prop({
    default: ContentDraftStatus.PENDING,
    enum: Object.values(ContentDraftStatus),
    type: String,
  })
  status!: ContentDraftStatus;

  @Prop({ type: Number })
  confidence?: number;

  @Prop({ required: true, type: String })
  generatedBy!: string;

  @Prop({ ref: 'User', type: Types.ObjectId })
  approvedBy?: Types.ObjectId;

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;
}

export const ContentDraftSchema = SchemaFactory.createForClass(ContentDraft);
