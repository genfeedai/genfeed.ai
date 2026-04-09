import type { PostCategory, PostFrequency, PostStatus } from '@genfeedai/enums';

export interface components {
  schemas: {
    CreatePostDto: {
      category?: PostCategory;
      credential: string;
      description: string;
      externalId?: string;
      externalShortcode?: string;
      groupId?: string;
      ingredients: string[];
      isAnalyticsEnabled?: boolean;
      isRepeat?: boolean;
      isShareToFeedSelected?: boolean;
      label: string;
      maxRepeats?: number;
      order?: number;
      parent?: string;
      publicationDate?: string;
      quoteTweetId?: string;
      repeatDaysOfWeek?: number[];
      repeatEndDate?: string;
      repeatFrequency?: PostFrequency;
      repeatInterval?: number;
      scheduledDate?: string;
      status: PostStatus;
      tags?: string[];
      timezone?: string;
    };
    UpdatePostDto: {
      category?: PostCategory;
      credential?: string;
      description?: string;
      externalId?: string;
      externalShortcode?: string;
      groupId?: string;
      ingredients?: string[];
      isAnalyticsEnabled?: boolean;
      isRepeat?: boolean;
      isShareToFeedSelected?: boolean;
      label?: string;
      maxRepeats?: number;
      order?: number;
      parent?: string;
      publicationDate?: string;
      quoteTweetId?: string;
      repeatDaysOfWeek?: number[];
      repeatEndDate?: string;
      repeatFrequency?: PostFrequency;
      repeatInterval?: number;
      scheduledDate?: string;
      status?: PostStatus;
      tags?: string[];
      timezone?: string;
    };
  };
}

export type paths = {};
