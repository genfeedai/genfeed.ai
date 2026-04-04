import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type ContextBaseDocument = ContextBase & Document;

@Schema({ collection: 'context-bases', timestamps: true })
export class ContextBase {
  _id!: Types.ObjectId;
  @Prop({
    ref: 'Organization',
    required: true,
    type: Types.ObjectId,
  })
  organization!: Types.ObjectId;

  @Prop({ ref: 'User', type: Types.ObjectId })
  createdBy?: Types.ObjectId;

  @Prop({ required: true, type: String })
  label!: string;

  @Prop({ required: true, type: String })
  description!: string;

  @Prop({
    enum: [
      'brand_voice',
      'content_library',
      'audience',
      'content_intelligence',
      'custom',
    ],
    required: true,
    type: String,
  })
  category!:
    | 'brand_voice'
    | 'content_library'
    | 'audience'
    | 'content_intelligence'
    | 'custom';

  @Prop({ required: false, type: String })
  source?: string; // 'onboarding', 'manual', 'auto-generated'

  @Prop({ required: false, type: String })
  sourceUrl?: string;

  @Prop({ ref: 'Brand', required: false, type: Types.ObjectId })
  sourceBrand?: Types.ObjectId; // If created from brand

  @Prop({ required: false, type: Date })
  lastAnalyzed?: Date;

  @Prop({ default: 0, type: Number })
  entryCount!: number; // Number of entries in this context base

  @Prop({ default: 0, type: Number })
  usageCount!: number; // How many times used in prompts

  @Prop({ default: true, type: Boolean })
  isActive!: boolean; // Can be disabled without deleting

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;
}

export const ContextBaseSchema = SchemaFactory.createForClass(ContextBase);
