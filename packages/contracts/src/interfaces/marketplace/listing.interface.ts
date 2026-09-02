import type { ListingType, PricingTier } from '../..';

import type { ISellerPreview } from './seller.interface';

/** Public catalog preview returned by marketplace listing APIs. */
export interface IListingPreview {
  id: string;
  type: ListingType;
  title: string;
  slug: string;
  shortDescription: string;
  price: number;
  currency: string;
  thumbnail?: string;
  rating: number;
  reviewCount: number;
  downloads: number;
  pricingTier?: PricingTier;
  isOfficial?: boolean;
  installCount?: number;
  seller?: ISellerPreview;
}
