import type { WatchlistPlatform } from '@genfeedai/contracts';
import type { IWatchlist } from '@genfeedai/contracts/interfaces';

export class Watchlist implements IWatchlist {
  public declare id: string;
  public declare brandId: string;
  public declare organizationId: string;
  public declare userId: string;
  public declare label: string;
  public declare platform: WatchlistPlatform;
  public declare handle: string;
  public declare category?: string;
  public declare notes?: string;
  public declare metrics?: {
    followers?: number;
    avgViews?: number;
    engagementRate?: number;
  };
  public declare profileUrl?: string;
  public declare avatarUrl?: string;
  public declare createdAt: Date;
  public declare updatedAt: Date;

  constructor(data: Partial<IWatchlist> = {}) {
    Object.assign(this, data);
  }
}
