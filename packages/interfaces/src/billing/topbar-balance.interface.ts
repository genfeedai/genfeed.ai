export type TopbarBalanceStatus = 'available' | 'unavailable';

export interface ITopbarBalanceSegment {
  provider: string;
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
