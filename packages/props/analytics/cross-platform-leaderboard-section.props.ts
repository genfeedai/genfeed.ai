import type { ITrendVideo } from '@genfeedai/contracts/interfaces';
import type { ICreatorWatchlist } from '@genfeedai/contracts/interfaces/analytics/creator-watchlist.interface';
import type { IconComponent } from '@genfeedai/contracts/types/icon';

export type PlatformConfigEntry = {
  icon?: IconComponent;
  label?: string;
};

export type Props = {
  viralLeaderboard: ITrendVideo[];
  creatorLeaderboard: ICreatorWatchlist[];
  platformConfigLookup: Record<string, PlatformConfigEntry>;
};
