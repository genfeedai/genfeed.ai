import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

@Schema({
  collation: { locale: 'en', strength: 1 },
  collection: 'clip-results',
  timestamps: true,
  versionKey: false,
})
export class ClipResult {
  _id!: string;

  @Prop({
    ref: 'User',
    required: true,
    type: Types.ObjectId,
  })
  user!: Types.ObjectId;

  @Prop({
    ref: 'Organization',
    required: true,
    type: Types.ObjectId,
  })
  organization!: Types.ObjectId;

  @Prop({
    ref: 'ClipProject',
    required: true,
    type: Types.ObjectId,
  })
  project!: Types.ObjectId;

  @Prop({ required: true, type: Number })
  index!: number;

  @Prop({ required: true, type: String })
  title!: string;

  @Prop({ default: '', type: String })
  summary!: string;

  @Prop({ required: true, type: Number })
  startTime!: number;

  @Prop({ required: true, type: Number })
  endTime!: number;

  @Prop({ required: true, type: Number })
  duration!: number;

  @Prop({ default: 0, type: Number })
  viralityScore!: number;

  @Prop({ default: [], type: [String] })
  tags!: string[];

  @Prop({
    enum: [
      'hook',
      'story',
      'tutorial',
      'reaction',
      'quote',
      'controversial',
      'educational',
    ],
    required: false,
    type: String,
  })
  clipType?: string;

  @Prop({ required: false, type: String })
  videoUrl?: string;

  @Prop({ required: false, type: String })
  videoS3Key?: string;

  @Prop({ required: false, type: String })
  captionedVideoUrl?: string;

  @Prop({ required: false, type: String })
  captionedVideoS3Key?: string;

  @Prop({ required: false, type: String })
  thumbnailUrl?: string;

  @Prop({ required: false, type: String })
  captionSrt?: string;

  @Prop({ required: false, type: String })
  providerJobId?: string;

  @Prop({ required: false, type: String })
  providerName?: string;

  @Prop({
    default: 'pending',
    enum: ['pending', 'extracting', 'captioning', 'completed', 'failed'],
    type: String,
  })
  status!: string;

  @Prop({ default: false, type: Boolean })
  isSelected!: boolean;

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;
}

export type ClipResultDocument = ClipResult & Document;

export const ClipResultSchema = SchemaFactory.createForClass(ClipResult);
