/**
 * Social media API integration interfaces
 * Used by TikTok, Instagram, Facebook, LinkedIn services
 */

import { InstagramMediaStatus, TikTokPublishStatus } from '@genfeedai/enums';

// TikTok interfaces
export interface ITikTokCreatorInfo {
  creator_avatar_url: string;
  creator_username: string;
  creator_nickname: string;
  privacy_level_options: string[];
  comment_disabled: boolean;
  duet_disabled: boolean;
  stitch_disabled: boolean;
  max_video_post_duration_sec: number;
}

export interface ITikTokPublishResponse {
  data?: {
    publish_id?: string;
    post_id?: string;
    isPending?: boolean;
    status?: TikTokPublishStatus | string;
  };
  error?: {
    code: string;
    message: string;
  };
}

export interface ITikTokPublishStatusData {
  status: TikTokPublishStatus | string;
  publicly_available_post_id?: string[];
  fail_reason?: string;
}

export interface ITikTokVideo {
  id: string;
  title?: string;
  create_time?: number;
  statistics?: {
    view_count?: number;
    like_count?: number;
    comment_count?: number;
    share_count?: number;
  };
}

export interface ITikTokUserInfo {
  open_id: string;
  union_id?: string;
  avatar_url?: string;
  display_name?: string;
  username?: string;
  follower_count?: number;
  following_count?: number;
  likes_count?: number;
  video_count?: number;
}

export interface ITikTokMediaAnalytics {
  views: number;
  likes: number;
  comments: number;
  shares?: number;
  downloads?: number;
  reach?: number;
  impressions?: number;
  engagementRate?: number;
  completionRate?: number;
  averageWatchTime?: number;
  mediaType?: 'video' | 'photo';
}

// Instagram interfaces
export interface IInstagramPage {
  id: string;
  name: string;
  username?: string;
  access_token?: string;
  instagram_business_account?: {
    id: string;
    username?: string;
  };
}

export interface IInstagramMediaContainer {
  id: string;
  status?: InstagramMediaStatus | string;
  status_code?: string;
}

export interface IInstagramPublishResult {
  id: string;
  permalink?: string;
}

// Facebook interfaces
export interface IFacebookPage {
  id: string;
  name: string;
  access_token?: string;
  category?: string;
  picture?: {
    data?: {
      url?: string;
    };
  };
}

export interface IFacebookPostParams {
  message?: string;
  link?: string;
  published?: boolean;
  scheduled_publish_time?: number;
}

export interface IFacebookMediaUploadResponse {
  id: string;
  post_id?: string;
}

// LinkedIn interfaces
export interface ILinkedInReactions {
  likes: number;
  comments: number;
  shares: number;
  impressions?: number;
  clicks?: number;
  engagementRate?: number;
}

export interface ILinkedInMediaAsset {
  asset: string;
  uploadMechanism?: {
    'com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'?: {
      uploadUrl: string;
      headers?: Record<string, string>;
    };
  };
}

// Shopify interfaces
export interface IShopifyProduct {
  id: string;
  title: string;
  handle: string;
  onlineStoreUrl?: string;
}

export interface IShopifyUserError {
  field: string[];
  message: string;
}

export interface IShopifyProductCreateResponse {
  data: {
    productCreate: {
      product: IShopifyProduct | null;
      userErrors: IShopifyUserError[];
    };
  };
}

export interface IShopifyProductUpdateResponse {
  data: {
    productUpdate: {
      product: IShopifyProduct | null;
      userErrors: IShopifyUserError[];
    };
  };
}

export interface IShopifyProductQueryResponse {
  data: {
    product: IShopifyProduct | null;
  };
}

export interface IShopifyTokenResponse {
  access_token: string;
  scope: string;
}

// Generic social trend interface
export interface ISocialTrend {
  topic: string;
  mentions: number;
  growthRate: number;
  metadata?: {
    videoId?: string;
    createdAt?: number;
    [key: string]: unknown;
  };
}
