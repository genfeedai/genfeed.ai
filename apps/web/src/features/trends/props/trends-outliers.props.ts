import type { OutlierLibraryPostResponse } from '@genfeedai/contracts/interfaces';

/** The Source facet of the outliers view, so a person can leave it. */
export interface TrendsOutliersProps {
  onSourceChange: (value: string) => void;
}

export interface OutlierPostPlayerProps {
  isRemixAvailable: boolean;
  onRemix: (post: OutlierLibraryPostResponse) => void;
  post: OutlierLibraryPostResponse;
}
