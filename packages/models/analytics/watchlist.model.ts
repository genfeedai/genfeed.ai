import type {
  IBrand,
  IOrganization,
  IUser,
  IWatchlist,
} from '@cloud/interfaces';
import type { WatchlistPlatform } from '@genfeedai/enums';

export class Watchlist implements IWatchlist {
  public id!: string;
  public brand!: IBrand;
  public organization!: IOrganization;
  public user!: IUser;

  public name!: string;
  public platform!: WatchlistPlatform;
  public handle!: string;
  public category?: string;
  public notes?: string;
  public metrics?: {
    followers?: number;
    avgViews?: number;
    engagementRate?: number;
  };

  public profileUrl?: string;
  public avatarUrl?: string;
  public createdAt!: Date;
  public updatedAt!: Date;

  constructor(partial: Partial<IWatchlist> = {}) {
    Object.assign(this, partial);
  }
}
