import type { WatchlistPlatform } from '@genfeedai/contracts';
import type {
  IBrand,
  IOrganization,
  IUser,
  IWatchlist,
} from '@genfeedai/contracts/interfaces';

export class Watchlist implements IWatchlist {
  public id!: string;
  public brandId!: string;
  public organizationId!: string;
  public userId!: string;
  public brand!: IBrand;
  public organization!: IOrganization;
  public user!: IUser;

  public label!: string;
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
