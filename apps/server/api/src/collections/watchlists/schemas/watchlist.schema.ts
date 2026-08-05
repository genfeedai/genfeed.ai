import type { Watchlist } from '@genfeedai/prisma';

export interface WatchlistDocument extends Omit<Watchlist, 'config'> {
  avatarUrl?: string;
  category?: string;
  config?: Record<string, unknown>;
  label: string;
  metrics?: {
    avgViews?: number;
    engagementRate?: number;
    followers?: number;
  };
  notes?: string;
  profileUrl?: string;
}
