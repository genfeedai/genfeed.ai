import type { WatchlistPlatform } from '../..';

export interface IWatchlistMetrics {
  followers?: number;
  avgViews?: number;
  engagementRate?: number;
}

export interface IWatchlist {
  id: string;
  brandId: string;
  organizationId: string;
  userId: string;
  label: string;
  platform: WatchlistPlatform;
  handle: string;
  category?: string;
  notes?: string;
  metrics?: IWatchlistMetrics;
  profileUrl?: string;
  avatarUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}
