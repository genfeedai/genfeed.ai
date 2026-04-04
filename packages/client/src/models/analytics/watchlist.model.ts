import type { WatchlistPlatform } from '@genfeedai/enums';
import type {
  IBrand,
  IOrganization,
  IUser,
  IWatchlist,
} from '@genfeedai/interfaces';

export class Watchlist implements IWatchlist {
  public declare id: string;
  public declare brand: string | IBrand;
  public declare organization: IOrganization;
  public declare user: IUser;
  public declare name: string;
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
