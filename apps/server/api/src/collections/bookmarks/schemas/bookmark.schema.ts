import {
  BookmarkCategory,
  BookmarkIntent,
  BookmarkPlatform,
} from '@genfeedai/enums';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type BookmarkDocument = Bookmark & Document;

@Schema({
  collation: { locale: 'en', strength: 1 },
  collection: 'bookmarks',
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
  versionKey: false,
})
export class Bookmark {
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

  @Prop({
    ref: 'Brand',
    required: false,
    type: Types.ObjectId,
  })
  brand?: Types.ObjectId;

  // Content category & source
  @Prop({
    default: BookmarkCategory.URL,
    enum: BookmarkCategory,
    required: true,
    type: String,
  })
  category!: string;

  @Prop({
    required: true,
    type: String,
  })
  url!: string;

  @Prop({
    default: BookmarkPlatform.WEB,
    enum: BookmarkPlatform,
    required: true,
    type: String,
  })
  platform!: string;

  // Content metadata
  @Prop({
    required: false,
    type: String,
  })
  title?: string;

  @Prop({
    required: true,
    type: String,
  })
  content!: string;

  @Prop({
    required: false,
    type: String,
  })
  description?: string;

  @Prop({
    required: false,
    type: String,
  })
  author?: string;

  @Prop({
    required: false,
    type: String,
  })
  authorHandle?: string;

  // Media
  @Prop({
    required: false,
    type: String,
  })
  thumbnailUrl?: string;

  @Prop({
    default: [],
    type: [String],
  })
  mediaUrls!: string[];

  @Prop({
    default: [],
    ref: 'Ingredient',
    type: [Types.ObjectId],
  })
  extractedIngredients!: Types.ObjectId[];

  // Platform-specific data
  @Prop({
    default: {},
    type: Object,
  })
  platformData!: {
    // Twitter
    tweetId?: string;
    engagement?: {
      likes?: number;
      retweets?: number;
      replies?: number;
    };

    // YouTube
    videoId?: string;
    duration?: number;
    channelId?: string;

    // Generic
    metadata?: Record<string, unknown>;
  };

  // Generation tracking
  @Prop({
    default: BookmarkIntent.INSPIRATION,
    enum: BookmarkIntent,
    required: true,
    type: String,
  })
  intent!: string;

  @Prop({
    default: [],
    ref: 'Ingredient',
    type: [Types.ObjectId],
  })
  generatedIngredients!: Types.ObjectId[];

  // Organization
  @Prop({
    ref: 'Folder',
    required: false,
    type: Types.ObjectId,
  })
  folder?: Types.ObjectId;

  @Prop({
    default: [],
    ref: 'Tag',
    type: [Types.ObjectId],
  })
  tags!: Types.ObjectId[];

  // Status
  @Prop({
    default: Date.now,
    required: true,
    type: Date,
  })
  savedAt!: Date;

  @Prop({
    required: false,
    type: Date,
  })
  processedAt?: Date;

  @Prop({
    default: false,
    type: Boolean,
  })
  isDeleted!: boolean;
}

export const BookmarkSchema = SchemaFactory.createForClass(Bookmark);
