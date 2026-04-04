import type { ListingStatus, ListingType, PricingTier } from '@genfeedai/enums';
import type { IIdentifiable, IPaginatedQuery } from '../index';

import type { ISeller, ISellerPreview } from './seller.interface';

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

export interface IListing extends IIdentifiable {
  seller: ISeller;
  organization: string;

  type: ListingType;
  title: string;
  slug: string;
  shortDescription: string;
  description: string;

  price: number;
  currency: string;

  tags: string[];

  thumbnail?: string;
  previewImages: string[];
  previewVideo?: string;
  previewData: Record<string, unknown>;

  views: number;
  downloads: number;
  purchases: number;
  rating: number;
  reviewCount: number;
  likeCount: number;

  version: string;
  changelog?: string;

  status: ListingStatus;
  publishedAt?: string;
  rejectionReason?: string;

  pricingTier?: PricingTier;
  isOfficial?: boolean;
  packageSource?: string;
  packageSlug?: string;
  installCount?: number;
}

export interface IListingWithOwnership extends IListing {
  owned: boolean;
  purchaseId?: string;
}

export interface IListingQueryParams extends IPaginatedQuery {
  type?: ListingType;
  tags?: string[];
  minPrice?: number;
  maxPrice?: number;
  search?: string;
  pricingTier?: PricingTier;
  isOfficial?: boolean;
}
