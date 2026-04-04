import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type TrendSourceReferenceSnapshotDocument =
  TrendSourceReferenceSnapshot & Document;

@Schema({
  collection: 'trend-source-reference-snapshots',
  timestamps: true,
  versionKey: false,
})
export class TrendSourceReferenceSnapshot {
  @Prop({ ref: 'TrendSourceReference', required: true, type: Types.ObjectId })
  sourceReference!: Types.ObjectId;

  @Prop({ required: true, type: Date })
  snapshotDate!: Date;

  @Prop({
    default: {
      comments: 0,
      likes: 0,
      shares: 0,
      views: 0,
    },
    type: Object,
  })
  metrics!: {
    comments?: number;
    likes?: number;
    shares?: number;
    views?: number;
  };

  @Prop({ default: 0, type: Number })
  engagementTotal!: number;

  @Prop({ default: 0, type: Number })
  trendMentions!: number;

  @Prop({ default: 0, type: Number })
  trendViralityScore!: number;

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;
}

export const TrendSourceReferenceSnapshotSchema = SchemaFactory.createForClass(
  TrendSourceReferenceSnapshot,
);
