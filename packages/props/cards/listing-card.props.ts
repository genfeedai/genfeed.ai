import type { IListingPreview } from '@genfeedai/contracts/interfaces';

export type ListingCardVariant = 'default' | 'compact' | 'featured';

export interface ListingCardProps {
  /** The listing data to display */
  listing: IListingPreview;
  /** Card variant */
  variant?: ListingCardVariant;
  className?: string;
}
