import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type ContextEntryDocument = ContextEntry & Document;

@Schema({ collection: 'context-entries', timestamps: true })
export class ContextEntry {
  @Prop({
    ref: 'ContextBase',
    required: true,
    type: Types.ObjectId,
  })
  contextBase!: Types.ObjectId;

  @Prop({
    ref: 'Organization',
    required: true,
    type: Types.ObjectId,
  })
  organization!: Types.ObjectId;

  @Prop({ required: true, type: String })
  content!: string; // The actual text content to embed

  @Prop({ type: [Number] })
  embedding?: number[]; // Embedding vector (dimension depends on provider)

  @Prop({ type: Object })
  metadata?: {
    source?: string; // 'instagram', 'tiktok', 'manual', 'website'
    sourceId?: string; // Post ID, article ID, etc.
    sourceUrl?: string;
    contentType?: string; // 'post', 'caption', 'article', 'guideline'
    engagementScore?: number; // How well it performed
    publishedAt?: Date;
    tags?: string[];
  };

  @Prop({ default: 1.0, type: Number })
  relevanceWeight!: number; // Higher = more important (0.0 - 1.0)

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;
}

export const ContextEntrySchema = SchemaFactory.createForClass(ContextEntry);
