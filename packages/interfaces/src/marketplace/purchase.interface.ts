import type { PurchaseStatus } from '@genfeedai/enums';
import type { IIdentifiable, IPaginatedQuery } from '../index';

import type { IListingPreview } from './listing.interface';
import type { ISellerPreview } from './seller.interface';

export interface IListingSnapshot {
  title: string;
  type: string;
  version: string;
  price: number;
}

export interface IPurchaseReview {
  rating: number;
  comment: string;
  createdAt: string;
}

export interface IPurchase extends IIdentifiable {
  buyer: string;
  seller: string;
  listing: string;
  organization: string;

  listingSnapshot: IListingSnapshot;

  subtotal: number;
  discount: number;
  total: number;
  currency: string;

  platformFee: number;
  sellerEarnings: number;

  stripeSessionId?: string;
  paymentMethod?: string;

  status: PurchaseStatus;
  failureReason?: string;

  downloadCount: number;
  lastDownloadedAt?: string;

  hasReviewed: boolean;
  review?: IPurchaseReview;

  isGift: boolean;
  giftRecipient?: string;
  giftMessage?: string;

  discountCode?: string;
}

export interface IPurchaseWithListing extends IPurchase {
  listingData?: IListingPreview;
  sellerData?: ISellerPreview;
}

export interface IPurchaseQueryParams extends IPaginatedQuery {
  status?: PurchaseStatus;
}

export interface IDownloadResponse {
  purchaseId: string;
  downloadData: Record<string, unknown>;
  downloadedAt: string;
}

export interface IOwnershipResponse {
  listingId: string;
  owned: boolean;
  purchaseId?: string;
}
