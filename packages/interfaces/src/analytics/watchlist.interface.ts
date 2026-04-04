import type { WatchlistPlatform } from '@genfeedai/enums';
import type { IBrand, IOrganization, IUser } from '../index';

export interface IWatchlistMetrics {
  followers?: number;
  avgViews?: number;
  engagementRate?: number;
}

export interface IWatchlist {
  id: string;
  brand: string | IBrand;
  organization: IOrganization;
  user: IUser;
  name: string;
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
