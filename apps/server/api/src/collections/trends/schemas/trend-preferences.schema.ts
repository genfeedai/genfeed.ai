import type { TrendPreferences as PrismaTrendPreferences } from '@genfeedai/prisma';

export interface TrendPreferencesDocument extends PrismaTrendPreferences {
  categories?: string[];
  hashtags?: string[];
  keywords?: string[];
  platforms?: string[];
  [key: string]: unknown;
}
