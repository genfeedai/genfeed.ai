/**
 * Instagram API response types
 */

/**
 * Instagram account details from Graph API
 */
export interface InstagramAccountDetails {
  id: string;
  username?: string;
  account_type?: string;
  media_count?: number;
}

/**
 * Instagram Business Account page information
 */
export interface InstagramPageResponse {
  _id: string;
  image?: string;
  label?: string;
  username?: string;
  isBusinessAccount?: boolean;
  platform?: string;
}

/**
 * Instagram credential with decrypted access token
 */
export interface InstagramCredentialResponse {
  _id: string;
  accessToken: string;
  externalId?: string;
  isConnected?: boolean;
}

/**
 * Instagram trending hashtag data
 */
export interface InstagramTrendingHashtag {
  topic: string;
  mentions: number;
  growthRate: number;
}
