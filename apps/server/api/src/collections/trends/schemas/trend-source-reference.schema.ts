import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document } from 'mongoose';

export type TrendSourceReferenceDocument = TrendSourceReference & Document;

@Schema({
  collection: 'trend-source-references',
  timestamps: true,
  versionKey: false,
})
export class TrendSourceReference {
  @Prop({ required: true, type: String })
  platform!: string;

  @Prop({ required: true, type: String })
  canonicalUrl!: string;

  @Prop({ type: String })
  externalId?: string;

  @Prop({ type: String })
  authorHandle?: string;

  @Prop({
    enum: ['image', 'post', 'tweet', 'video'],
    required: true,
    type: String,
  })
  contentType!: 'image' | 'post' | 'tweet' | 'video';

  @Prop({ type: String })
  title?: string;

  @Prop({ type: String })
  text?: string;

  @Prop({ type: String })
  thumbnailUrl?: string;

  @Prop({ type: String })
  mediaUrl?: string;

  @Prop({ type: Date })
  publishedAt?: Date;

  @Prop({ default: Date.now, required: true, type: Date })
  firstSeenAt!: Date;

  @Prop({ default: Date.now, required: true, type: Date })
  lastSeenAt!: Date;

  @Prop({ default: 0, type: Number })
  latestTrendMentions!: number;

  @Prop({ default: 0, type: Number })
  latestTrendViralityScore!: number;

  @Prop({
    default: {
      comments: 0,
      likes: 0,
      shares: 0,
      views: 0,
    },
    type: Object,
  })
  currentMetrics!: {
    comments?: number;
    likes?: number;
    shares?: number;
    views?: number;
  };

  @Prop({ default: 0, type: Number })
  currentEngagementTotal!: number;

  @Prop({ default: [], type: [String] })
  matchedTrendTopics!: string[];

  @Prop({
    default: 'fallback',
    enum: ['live', 'fallback', 'empty'],
    type: String,
  })
  sourcePreviewState!: 'live' | 'fallback' | 'empty';

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;
}

export const TrendSourceReferenceSchema =
  SchemaFactory.createForClass(TrendSourceReference);
