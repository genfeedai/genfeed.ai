import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type AdBulkUploadJobDocument = AdBulkUploadJob & Document;

export type BulkUploadStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'partial'
  | 'failed'
  | 'cancelled';

export type CreativeSource =
  | 'content-library'
  | 'ai-generated'
  | 'manual-upload';

export interface BulkUploadError {
  permutationIndex: number;
  message: string;
  timestamp: Date;
}

@Schema({
  collation: { locale: 'en', strength: 1 },
  collection: 'ad-bulk-upload-jobs',
  timestamps: true,
  versionKey: false,
})
export class AdBulkUploadJob {
  @Prop({ ref: 'Organization', required: true, type: Types.ObjectId })
  organization!: Types.ObjectId;

  @Prop({ ref: 'Brand', type: Types.ObjectId })
  brand?: Types.ObjectId;

  @Prop({ ref: 'Credential', required: true, type: Types.ObjectId })
  credential!: Types.ObjectId;

  @Prop({ required: true, type: String })
  adAccountId!: string;

  @Prop({ required: true, type: String })
  campaignId!: string;

  @Prop({ required: true, type: String })
  adSetId!: string;

  @Prop({
    default: 'manual-upload',
    enum: ['content-library', 'ai-generated', 'manual-upload'],
    type: String,
  })
  creativeSource!: CreativeSource;

  @Prop({ default: [], type: [String] })
  images!: string[];

  @Prop({ default: [], type: [String] })
  videos!: string[];

  @Prop({ default: [], type: [String] })
  headlines!: string[];

  @Prop({ default: [], type: [String] })
  bodyCopies!: string[];

  @Prop({ type: String })
  callToAction?: string;

  @Prop({ type: String })
  linkUrl?: string;

  @Prop({ default: 0, type: Number })
  totalPermutations!: number;

  @Prop({ default: 0, type: Number })
  completedPermutations!: number;

  @Prop({ default: 0, type: Number })
  failedPermutations!: number;

  @Prop({ default: [], type: [Object] })
  uploadErrors!: BulkUploadError[];

  @Prop({
    default: 'pending',
    enum: [
      'pending',
      'processing',
      'completed',
      'partial',
      'failed',
      'cancelled',
    ],
    type: String,
  })
  status!: BulkUploadStatus;

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;
}

export const AdBulkUploadJobSchema =
  SchemaFactory.createForClass(AdBulkUploadJob);
