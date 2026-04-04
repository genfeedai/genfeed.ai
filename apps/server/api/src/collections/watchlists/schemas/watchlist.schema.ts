import { WatchlistPlatform } from '@genfeedai/enums';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type WatchlistDocument = Watchlist & Document;

@Schema({
  collation: { locale: 'en', strength: 1 },
  collection: 'watchlists',
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
  versionKey: false,
})
export class Watchlist {
  _id!: Types.ObjectId;
  @Prop({
    ref: 'Brand',
    required: true,
    type: Types.ObjectId,
  })
  brand!: Types.ObjectId;

  @Prop({
    ref: 'Organization',
    required: true,
    type: Types.ObjectId,
  })
  organization!: Types.ObjectId;

  @Prop({
    ref: 'User',
    required: true,
    type: Types.ObjectId,
  })
  user!: Types.ObjectId;

  @Prop({
    required: true,
    type: String,
  })
  label!: string;

  @Prop({
    enum: WatchlistPlatform,
    required: true,
    type: String,
  })
  platform!: string;

  @Prop({
    required: true,
    type: String,
  })
  handle!: string;

  @Prop({
    required: false,
    type: String,
  })
  category?: string;

  @Prop({
    required: false,
    type: String,
  })
  notes?: string;

  @Prop({
    default: {},
    type: Object,
  })
  metrics!: {
    followers?: number;
    avgViews?: number;
    engagementRate?: number;
  };

  @Prop({
    required: false,
    type: String,
  })
  profileUrl?: string;

  @Prop({
    required: false,
    type: String,
  })
  avatarUrl?: string;

  @Prop({
    default: false,
    type: Boolean,
  })
  isDeleted!: boolean;
}

export const WatchlistSchema = SchemaFactory.createForClass(Watchlist);
