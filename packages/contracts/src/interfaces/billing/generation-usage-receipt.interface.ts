import type { ActivitySource } from '../../enums/activity.enum';

/** Server-only receipt for BYOK completion; never a wallet reservation. */
export interface IGenerationUsageReceipt {
  kind: 'byok';
  amount: number;
  description: string;
  expiresAt: string;
  source: ActivitySource;
  state: 'pending' | 'recorded' | 'failed';
  userId: string;
}
