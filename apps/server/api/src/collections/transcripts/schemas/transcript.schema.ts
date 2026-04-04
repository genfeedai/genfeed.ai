import { TranscriptStatus } from '@genfeedai/enums';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type TranscriptDocument = Transcript & Document;

export interface TranscriptVideoMetadata {
  duration?: number;
  viewCount?: number;
  likeCount?: number;
  description?: string;
  publishedAt?: Date;
  categoryId?: string;
  tags?: string[];
}

@Schema({
  collation: { locale: 'en', strength: 1 },
  collection: 'transcripts',
  timestamps: true,
  versionKey: false,
})
export class Transcript {
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
    ref: 'Article',
    required: false,
    type: Types.ObjectId,
  })
  article?: Types.ObjectId;

  @Prop({
    required: true,
    trim: true,
    type: String,
  })
  youtubeUrl!: string;

  @Prop({
    required: true,
    trim: true,
    type: String,
  })
  youtubeId!: string;

  @Prop({
    required: false,
    trim: true,
    type: String,
  })
  videoTitle?: string;

  @Prop({
    required: false,
    type: Number,
  })
  videoDuration?: number;

  @Prop({
    _id: false,
    required: false,
    type: {
      categoryId: { type: String },
      description: { type: String },
      duration: { type: Number },
      likeCount: { type: Number },
      publishedAt: { type: Date },
      tags: [{ type: String }],
      viewCount: { type: Number },
    },
  })
  videoMetadata?: TranscriptVideoMetadata;

  @Prop({
    default: '',
    required: false,
    type: String,
  })
  transcriptText!: string;

  @Prop({
    required: false,
    trim: true,
    type: String,
  })
  language?: string;

  @Prop({
    default: TranscriptStatus.PENDING,
    enum: Object.values(TranscriptStatus),
    required: true,
    type: String,
  })
  status!: TranscriptStatus;

  @Prop({
    required: false,
    type: String,
  })
  error?: string;

  @Prop({
    required: false,
    type: String,
  })
  audioFileUrl?: string;

  @Prop({
    default: false,
    type: Boolean,
  })
  isDeleted!: boolean;
}

export const TranscriptSchema = SchemaFactory.createForClass(Transcript);
