import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type AdCreativeMappingDocument = AdCreativeMapping & Document;

export type AdCreativeMappingStatus =
  | 'draft'
  | 'submitted'
  | 'active'
  | 'paused'
  | 'rejected'
  | 'archived';

@Schema({
  collation: { locale: 'en', strength: 1 },
  collection: 'ad-creative-mappings',
  timestamps: true,
  versionKey: false,
})
export class AdCreativeMapping {
  @Prop({ ref: 'Organization', required: true, type: Types.ObjectId })
  organization!: Types.ObjectId;

  @Prop({ ref: 'Brand', type: Types.ObjectId })
  brand?: Types.ObjectId;

  @Prop({ required: true, type: String })
  genfeedContentId!: string;

  @Prop({ type: String })
  externalAdId?: string;

  @Prop({ type: String })
  externalCreativeId?: string;

  @Prop({ required: true, type: String })
  adAccountId!: string;

  @Prop({
    default: 'meta',
    enum: ['meta', 'google', 'tiktok'],
    required: true,
    type: String,
  })
  platform!: string;

  @Prop({
    default: 'draft',
    enum: ['draft', 'submitted', 'active', 'paused', 'rejected', 'archived'],
    required: true,
    type: String,
  })
  status!: AdCreativeMappingStatus;

  @Prop({ default: {}, type: Object })
  metadata!: Record<string, unknown>;

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;
}

export const AdCreativeMappingSchema =
  SchemaFactory.createForClass(AdCreativeMapping);
