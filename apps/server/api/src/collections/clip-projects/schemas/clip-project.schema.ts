import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, SchemaTypes, Types } from 'mongoose';

/**
 * A highlight detected by GPT-4o analysis. Stored on the ClipProject after
 * the analyze step so users can review / edit before generation.
 */
export interface IHighlight {
  id: string;
  start_time: number;
  end_time: number;
  title: string;
  summary: string;
  virality_score: number;
  tags: string[];
  clip_type: string;
}

@Schema({ _id: false, versionKey: false })
export class VideoMetadata {
  @Prop({ type: Number })
  duration?: number;

  @Prop({ type: Number })
  width?: number;

  @Prop({ type: Number })
  height?: number;

  @Prop({ type: Number })
  fps?: number;

  @Prop({ type: String })
  codec?: string;

  @Prop({ type: Number })
  fileSize?: number;
}

@Schema({ _id: false, versionKey: false })
export class TranscriptSegment {
  @Prop({ required: true, type: Number })
  start!: number;

  @Prop({ required: true, type: Number })
  end!: number;

  @Prop({ required: true, type: String })
  text!: string;
}

@Schema({ _id: false, versionKey: false })
export class ClipProjectSettings {
  @Prop({ default: 15, type: Number })
  minDuration!: number;

  @Prop({ default: 90, type: Number })
  maxDuration!: number;

  @Prop({ default: 10, type: Number })
  maxClips!: number;

  @Prop({ default: '9:16', type: String })
  aspectRatio!: string;

  @Prop({ default: 'default', type: String })
  captionStyle!: string;

  @Prop({ default: true, type: Boolean })
  addCaptions!: boolean;
}

export const ClipProjectStatus = [
  'pending',
  'transcribing',
  'analyzing',
  'analyzed',
  'clipping',
  'generating',
  'completed',
  'failed',
] as const;

export type ClipProjectStatusType = (typeof ClipProjectStatus)[number];

@Schema({
  collation: { locale: 'en', strength: 1 },
  collection: 'clip-projects',
  timestamps: true,
  versionKey: false,
})
export class ClipProject {
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

  @Prop({ default: '', type: String })
  name!: string;

  @Prop({ required: true, type: String })
  sourceVideoUrl!: string;

  @Prop({ required: false, type: String })
  sourceVideoS3Key?: string;

  @Prop({ required: false, type: VideoMetadata })
  videoMetadata?: VideoMetadata;

  @Prop({ required: false, type: String })
  transcriptText?: string;

  @Prop({ required: false, type: String })
  transcriptSrt?: string;

  @Prop({ default: [], type: [TranscriptSegment] })
  transcriptSegments!: TranscriptSegment[];

  @Prop({ default: 'en', type: String })
  language!: string;

  @Prop({
    default: 'pending',
    enum: ClipProjectStatus,
    type: String,
  })
  status!: ClipProjectStatusType;

  @Prop({ default: 0, type: Number })
  progress!: number;

  @Prop({ default: () => ({}), type: ClipProjectSettings })
  settings!: ClipProjectSettings;

  @Prop({ default: [], type: [SchemaTypes.Mixed] })
  highlights!: IHighlight[];

  @Prop({ required: false, type: String })
  error?: string;

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;
}

export type ClipProjectDocument = ClipProject & Document;

export const ClipProjectSchema = SchemaFactory.createForClass(ClipProject);
