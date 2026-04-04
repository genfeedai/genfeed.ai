import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Schema as MongooseSchema, Types } from 'mongoose';

export type BrandMemoryDocument = BrandMemory & Document;

@Schema({ _id: false })
export class BrandMemoryEntry {
  @Prop({ required: true, type: String })
  type!: string;

  @Prop({ required: true, type: String })
  content!: string;

  @Prop({ required: false, type: MongooseSchema.Types.Mixed })
  metadata?: Record<string, unknown>;

  @Prop({ required: true, type: Date })
  timestamp!: Date;
}

@Schema({ _id: false })
export class BrandMemoryInsight {
  @Prop({ required: true, type: String })
  category!: string;

  @Prop({ required: true, type: String })
  insight!: string;

  @Prop({ max: 1, min: 0, required: true, type: Number })
  confidence!: number;

  @Prop({ required: true, type: String })
  source!: string;

  @Prop({ required: true, type: Date })
  createdAt!: Date;
}

@Schema({ _id: false })
export class BrandMemoryMetrics {
  @Prop({ default: 0, type: Number })
  postsPublished!: number;

  @Prop({ default: 0, type: Number })
  totalEngagement!: number;

  @Prop({ default: 0, type: Number })
  avgEngagementRate!: number;

  @Prop({ required: false, type: String })
  topPerformingFormat?: string;

  @Prop({ required: false, type: String })
  topPerformingTime?: string;
}

@Schema({
  collection: 'brand-memory',
  timestamps: true,
  versionKey: false,
})
export class BrandMemory {
  _id!: string;

  @Prop({
    index: true,
    ref: 'Organization',
    required: true,
    type: Types.ObjectId,
  })
  organization!: Types.ObjectId;

  @Prop({
    index: true,
    ref: 'Brand',
    required: true,
    type: Types.ObjectId,
  })
  brand!: Types.ObjectId;

  @Prop({ index: true, required: true, type: Date })
  date!: Date;

  @Prop({ default: [], type: [BrandMemoryEntry] })
  entries!: BrandMemoryEntry[];

  @Prop({ default: [], type: [BrandMemoryInsight] })
  insights!: BrandMemoryInsight[];

  @Prop({ default: () => ({}), type: BrandMemoryMetrics })
  metrics!: BrandMemoryMetrics;

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;

  createdAt!: Date;
  updatedAt!: Date;
}

export const BrandMemorySchema = SchemaFactory.createForClass(BrandMemory);
