import type { IListingPreview } from '@genfeedai/interfaces';

export type ListingCardVariant = 'default' | 'compact' | 'featured';

export interface ListingCardProps {
  /** The listing data to display */
  listing: IListingPreview;
  /** Card variant */
  variant?: ListingCardVariant;
  className?: string;
}
