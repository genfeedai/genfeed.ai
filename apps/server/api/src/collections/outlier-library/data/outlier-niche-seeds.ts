import type { OutlierLibraryPlatform } from '@genfeedai/contracts/interfaces';

export interface OutlierNicheSeed {
  handle: string;
  niche: string;
  platform: OutlierLibraryPlatform;
}

/**
 * Hand list of creators per niche (#11642). Public creators only, one entry
 * per creator; the weekly read tracks them next to the creators the trends
 * refresh finds. Add an entry as a reviewed commit.
 */
export const OUTLIER_NICHE_SEEDS: readonly OutlierNicheSeed[] = [];
