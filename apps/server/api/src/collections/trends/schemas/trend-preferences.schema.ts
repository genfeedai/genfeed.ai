import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type TrendPreferencesDocument = TrendPreferences & Document;

@Schema({ collection: 'trend-preferences', timestamps: true })
export class TrendPreferences {
  @Prop({
    ref: 'Organization',
    required: true,
    type: Types.ObjectId,
  })
  organization!: Types.ObjectId;

  @Prop({
    default: null,
    ref: 'Brand',
    required: false,
    type: Types.ObjectId,
  })
  brand?: Types.ObjectId | null;

  @Prop({
    default: [],
    type: [String],
  })
  categories!: string[]; // Industries/interests: tech, finance, healthcare, etc.

  @Prop({
    default: [],
    type: [String],
  })
  keywords!: string[]; // Specific topics/keywords to track

  @Prop({
    default: [],
    enum: [
      'tiktok',
      'instagram',
      'linkedin',
      'twitter',
      'youtube',
      'reddit',
      'pinterest',
    ],
    type: [String],
  })
  platforms!: string[]; // Preferred platforms

  @Prop({
    default: [],
    type: [String],
  })
  hashtags!: string[]; // Specific hashtags to track

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;
}

export const TrendPreferencesSchema =
  SchemaFactory.createForClass(TrendPreferences);
