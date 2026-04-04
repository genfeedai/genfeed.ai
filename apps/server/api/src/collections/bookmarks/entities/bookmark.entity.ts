import { Bookmark } from '@api/collections/bookmarks/schemas/bookmark.schema';
import { BaseEntity } from '@api/shared/entities/base/base.entity';
import {
  BookmarkCategory,
  BookmarkIntent,
  BookmarkPlatform,
} from '@genfeedai/enums';
import { Types } from 'mongoose';

export class BookmarkEntity extends BaseEntity implements Bookmark {
  user!: Types.ObjectId;
  organization!: Types.ObjectId;
  brand?: Types.ObjectId;
  category!: BookmarkCategory;
  url!: string;
  platform!: BookmarkPlatform;
  title?: string;
  content!: string;
  description?: string;
  author?: string;
  authorHandle?: string;
  thumbnailUrl?: string;
  mediaUrls!: string[];
  extractedIngredients!: Types.ObjectId[];
  platformData!: {
    tweetId?: string;
    engagement?: {
      likes?: number;
      retweets?: number;
      replies?: number;
    };
    videoId?: string;
    duration?: number;
    channelId?: string;
    metadata?: Record<string, unknown>;
  };
  intent!: BookmarkIntent;
  generatedIngredients!: Types.ObjectId[];
  folder?: Types.ObjectId;
  tags!: Types.ObjectId[];
  savedAt!: Date;
  processedAt?: Date;
}
