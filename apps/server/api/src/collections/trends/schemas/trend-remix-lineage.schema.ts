import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type TrendRemixLineageDocument = TrendRemixLineage & Document;

@Schema({
  collection: 'trend-remix-lineages',
  timestamps: true,
  versionKey: false,
})
export class TrendRemixLineage {
  @Prop({ ref: 'Organization', required: true, type: Types.ObjectId })
  organization!: Types.ObjectId;

  @Prop({ ref: 'Brand', required: true, type: Types.ObjectId })
  brand!: Types.ObjectId;

  @Prop({ ref: 'ContentDraft', required: false, type: Types.ObjectId })
  contentDraft?: Types.ObjectId;

  @Prop({ ref: 'Post', required: false, type: Types.ObjectId })
  post?: Types.ObjectId;

  @Prop({
    default: [],
    ref: 'TrendSourceReference',
    type: [Types.ObjectId],
  })
  sourceReferences!: Types.ObjectId[];

  @Prop({ default: [], ref: 'Trend', type: [Types.ObjectId] })
  trends!: Types.ObjectId[];

  @Prop({ default: [], type: [String] })
  sourceUrls!: string[];

  @Prop({ default: [], type: [String] })
  platforms!: string[];

  @Prop({ required: true, type: String })
  generatedBy!: string;

  @Prop({ type: String })
  draftType?: string;

  @Prop({ type: String })
  prompt?: string;

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;
}

export const TrendRemixLineageSchema =
  SchemaFactory.createForClass(TrendRemixLineage);
