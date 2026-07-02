import type { TrendPreferences as PrismaTrendPreferences } from '@genfeedai/prisma';

export interface TrendPreferencesDocument extends PrismaTrendPreferences {
  categories?: string[];
  hashtags?: string[];
  keywords?: string[];
  platforms?: string[];
  /**
   * When true, winning content-run signals are automatically fed back into this
   * org/brand's trend ingestion (issue #166). Opt-in: defaults to false.
   */
  autoRequeueWinners?: boolean;
  [key: string]: unknown;
}
