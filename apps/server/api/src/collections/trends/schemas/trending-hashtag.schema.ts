export interface TrendingHashtagDocument {
  _id?: string;
  id?: string;
  externalId?: string;
  platform?: string;
  hashtag: string;
  relatedHashtags?: string[];
  postCount?: number;
  viralityScore?: number;
  velocity?: number;
  isCurrent?: boolean;
  expiresAt?: Date | string | null;
  lastSeenAt?: Date | string | null;
  createdAt?: Date | string;
  updatedAt?: Date | string;
  [key: string]: unknown;
}
