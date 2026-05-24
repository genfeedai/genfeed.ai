export interface TrendingSoundDocument {
  _id?: string;
  id?: string;
  externalId?: string;
  platform?: string;
  soundId?: string | null;
  soundName?: string | null;
  playUrl?: string;
  coverUrl?: string | null;
  authorName?: string | null;
  duration?: number;
  usageCount?: number;
  growthRate?: number;
  velocity?: number;
  viralityScore?: number;
  isCurrent?: boolean;
  expiresAt?: Date | string | null;
  lastSeenAt?: Date | string | null;
  createdAt?: Date | string;
  updatedAt?: Date | string;
  [key: string]: unknown;
}
