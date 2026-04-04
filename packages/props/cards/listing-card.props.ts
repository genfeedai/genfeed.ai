import type { IListingPreview } from '@cloud/interfaces';

export type ListingCardVariant = 'default' | 'compact' | 'featured';

export interface ListingCardProps {
  /** The listing data to display */
  listing: IListingPreview;
  /** Card variant */
  variant?: ListingCardVariant;
  /** Additional CSS classes */
  className?: string;
}
