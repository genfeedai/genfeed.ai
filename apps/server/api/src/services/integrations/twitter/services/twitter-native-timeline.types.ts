import type {
  BreakoutExposureEvidence,
  BreakoutExposureMetric,
} from '@genfeedai/contracts/interfaces';
import type { LearningFormat } from '@genfeedai/contracts/interfaces/analytics/content-learning.interface';

export type TwitterTimelineResponse = {
  data?: Array<{
    id: string;
    text?: string;
    created_at?: string;
    author_id?: string;
    in_reply_to_user_id?: string;
    referenced_tweets?: Array<{ type: string; id: string }>;
    attachments?: { media_keys?: string[] };
    organic_metrics?: { impression_count?: number };
    public_metrics?: {
      impression_count?: number;
      like_count?: number;
      reply_count?: number;
      retweet_count?: number;
    };
  }>;
  includes?: {
    media?: Array<{
      media_key?: string;
      type: string;
      url?: string;
      preview_image_url?: string;
      variants?: Array<{
        bit_rate?: number;
        content_type?: string;
        url?: string;
      }>;
    }>;
    users?: Array<{
      id: string;
      username?: string;
      name?: string;
      profile_image_url?: string;
      public_metrics?: { followers_count?: number };
    }>;
  };
};

export interface TwitterTimelinePost {
  id: string;
  text: string;
  nativeAuthorVerified?: boolean;
  nativeFormat?: LearningFormat;
  attachmentMediaKeys?: string[];
  breakoutExposures?: Partial<
    Record<BreakoutExposureMetric, BreakoutExposureEvidence>
  >;
  /** `video` for video and animated GIF, `image` for photos, else `tweet`. */
  contentType?: 'image' | 'tweet' | 'video';
  /** Playable mp4 for video, the photo url for images. */
  mediaUrls?: string[];
  thumbnailUrl?: string;
  createdAt?: Date;
  authorId?: string;
  authorUsername?: string;
  authorName?: string;
  authorAvatarUrl?: string;
  authorFollowersCount?: number;
  isRetweet: boolean;
  inReplyToId: string | null;
  metrics?: { likes: number; comments: number; shares: number };
}
