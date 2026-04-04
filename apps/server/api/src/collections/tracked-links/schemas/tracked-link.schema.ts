import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type TrackedLinkDocument = TrackedLink & Document;

@Schema({ collection: 'tracked-links', timestamps: true })
export class TrackedLink {
  _id!: Types.ObjectId;
  @Prop({
    ref: 'Organization',
    required: true,
    type: Types.ObjectId,
  })
  organization!: Types.ObjectId;

  // Link details
  @Prop({ required: true, type: String })
  originalUrl!: string;

  @Prop({ required: true, type: String })
  shortUrl!: string;

  @Prop({ index: true, required: true, type: String })
  shortCode!: string;

  @Prop({ type: String })
  customSlug?: string;

  // Association
  @Prop({ ref: 'Ingredient', type: Types.ObjectId })
  content?: Types.ObjectId;

  @Prop({ type: String })
  contentType?: string;

  @Prop({ type: String })
  platform?: string;

  @Prop({ ref: 'Brand', type: Types.ObjectId })
  brand?: Types.ObjectId;

  @Prop({ type: String })
  campaignName?: string;

  // UTM parameters
  @Prop({
    type: {
      campaign: String,
      content: String,
      medium: String,
      source: String,
      term: String,
    },
  })
  utm!: {
    source: string;
    medium: string;
    campaign?: string;
    content?: string;
    term?: string;
  };

  // Stats
  @Prop({
    default: () => ({ totalClicks: 0, uniqueClicks: 0 }),
    type: {
      lastClickAt: Date,
      totalClicks: { default: 0, type: Number },
      uniqueClicks: { default: 0, type: Number },
    },
  })
  stats!: {
    totalClicks: number;
    uniqueClicks: number;
    lastClickAt?: Date;
  };

  // Settings
  @Prop({ default: true, type: Boolean })
  isActive!: boolean;

  @Prop({ type: Date })
  expiresAt?: Date;

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;
}

export const TrackedLinkSchema = SchemaFactory.createForClass(TrackedLink);
