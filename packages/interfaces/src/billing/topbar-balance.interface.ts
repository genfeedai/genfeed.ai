export type TopbarBalanceProvider = 'genfeed' | 'replicate' | 'fal';

export type TopbarBalanceStatus = 'available' | 'unavailable';

export interface ITopbarBalanceSegment {
  provider: TopbarBalanceProvider;
  label: string;
  balance: number | null;
  currencyOrUnit: string;
  status: TopbarBalanceStatus;
  lastSyncedAt: string;
  error?: string;
}

export interface ITopbarBalances {
  segments: ITopbarBalanceSegment[];
  generatedAt: string;
}
