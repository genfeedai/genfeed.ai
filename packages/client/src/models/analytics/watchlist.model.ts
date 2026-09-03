import type { WatchlistPlatform } from '@genfeedai/contracts';
import type { IWatchlist } from '@genfeedai/contracts/interfaces';

export class Watchlist implements IWatchlist {
  declare public id: string;
  declare public brandId: string;
  declare public organizationId: string;
  declare public userId: string;
  declare public label: string;
  declare public platform: WatchlistPlatform;
  declare public handle: string;
  declare public category?: string;
  declare public notes?: string;
  declare public metrics?: {
    followers?: number;
    avgViews?: number;
    engagementRate?: number;
  };
  declare public profileUrl?: string;
  declare public avatarUrl?: string;
  declare public createdAt: Date;
  declare public updatedAt: Date;

  constructor(data: Partial<IWatchlist> = {}) {
    Object.assign(this, data);
  }
}
