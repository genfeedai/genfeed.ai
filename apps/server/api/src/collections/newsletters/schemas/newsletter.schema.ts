import {
  NEWSLETTER_SOURCE_TYPES,
  NEWSLETTER_STATUSES,
  type NewsletterSourceType,
  type NewsletterStatus,
} from '@api/collections/newsletters/newsletter.constants';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type NewsletterDocument = Newsletter & Document;

@Schema({ _id: false })
export class NewsletterSourceRef {
  @Prop({ required: true, trim: true, type: String })
  label!: string;

  @Prop({ required: false, trim: true, type: String })
  url?: string;

  @Prop({ required: false, trim: true, type: String })
  note?: string;

  @Prop({
    enum: NEWSLETTER_SOURCE_TYPES,
    required: true,
    type: String,
  })
  sourceType!: NewsletterSourceType;
}

@Schema({
  collation: { locale: 'en', strength: 1 },
  collection: 'newsletters',
  timestamps: true,
  versionKey: false,
})
export class Newsletter {
  @Prop({ ref: 'User', required: true, type: Types.ObjectId })
  user!: Types.ObjectId;

  @Prop({ ref: 'Organization', required: true, type: Types.ObjectId })
  organization!: Types.ObjectId;

  @Prop({ ref: 'Brand', required: true, type: Types.ObjectId })
  brand!: Types.ObjectId;

  @Prop({ required: true, trim: true, type: String })
  label!: string;

  @Prop({ required: true, trim: true, type: String })
  topic!: string;

  @Prop({ required: false, trim: true, type: String })
  angle?: string;

  @Prop({ required: false, trim: true, type: String })
  summary?: string;

  @Prop({ default: '', type: String })
  content!: string;

  @Prop({
    default: 'draft',
    enum: NEWSLETTER_STATUSES,
    required: true,
    type: String,
  })
  status!: NewsletterStatus;

  @Prop({ default: [], type: [NewsletterSourceRef] })
  sourceRefs?: NewsletterSourceRef[];

  @Prop({
    default: [],
    ref: 'Newsletter',
    type: [Types.ObjectId],
  })
  contextNewsletterIds?: Types.ObjectId[];

  @Prop({ required: false, trim: true, type: String })
  generationPrompt?: string;

  @Prop({ ref: 'AgentRun', required: false, type: Types.ObjectId })
  agentRunId?: Types.ObjectId;

  @Prop({ ref: 'User', required: false, type: Types.ObjectId })
  approvedByUser?: Types.ObjectId;

  @Prop({ ref: 'User', required: false, type: Types.ObjectId })
  publishedByUser?: Types.ObjectId;

  @Prop({ required: false, type: Date })
  approvedAt?: Date;

  @Prop({ required: false, type: Date })
  publishedAt?: Date;

  @Prop({ required: false, type: Date })
  scheduledFor?: Date;

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;
}

export const NewsletterSourceRefSchema =
  SchemaFactory.createForClass(NewsletterSourceRef);
export const NewsletterSchema = SchemaFactory.createForClass(Newsletter);
