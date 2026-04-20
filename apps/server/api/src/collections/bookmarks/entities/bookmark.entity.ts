import { BaseEntity } from '@api/shared/entities/base/base.entity';
import {
  BookmarkCategory,
  BookmarkIntent,
  BookmarkPlatform,
} from '@genfeedai/enums';
import { type Bookmark } from '@genfeedai/prisma';

export class BookmarkEntity extends BaseEntity implements Bookmark {
  user!: string;
  organization!: string;
  brand?: string;
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
  extractedIngredients!: string[];
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
  generatedIngredients!: string[];
  folder?: string;
  tags!: string[];
  savedAt!: Date;
  processedAt?: Date;
}
