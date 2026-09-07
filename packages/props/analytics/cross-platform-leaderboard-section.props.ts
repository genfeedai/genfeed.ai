import type { ITrendVideo } from '@genfeedai/contracts/interfaces';
import type { ICreatorWatchlist } from '@genfeedai/contracts/interfaces/analytics/creator-watchlist.interface';
import type { ComponentType } from 'react';

export type PlatformConfigEntry = {
  icon?: ComponentType<{ className?: string }>;
  label?: string;
};

export type Props = {
  viralLeaderboard: ITrendVideo[];
  creatorLeaderboard: ICreatorWatchlist[];
  platformConfigLookup: Record<string, PlatformConfigEntry>;
};
