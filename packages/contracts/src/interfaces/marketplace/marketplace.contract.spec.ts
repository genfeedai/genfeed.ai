import { describe, expect, it } from 'vitest';
import { ListingType, PricingTier, SellerBadgeTier } from '../..';
import type {
  ICheckoutResponse,
  IClaimFreeResponse,
  ICreateCheckoutDto,
  IOwnershipResponse,
} from './checkout.interface';
import type { IListingPreview } from './listing.interface';
import type { ISellerPreview } from './seller.interface';

const sellerPreview = {
  badgeTier: SellerBadgeTier.VERIFIED,
  displayName: 'Genfeed',
  id: 'seller-1',
  rating: 4.8,
  slug: 'genfeed',
  totalSales: 12,
} satisfies ISellerPreview;

const listingPreview = {
  currency: 'USD',
  downloads: 40,
  id: 'listing-1',
  isOfficial: true,
  price: 0,
  pricingTier: PricingTier.FREE,
  rating: 4.8,
  reviewCount: 6,
  seller: sellerPreview,
  shortDescription: 'Official workflow preview',
  slug: 'official-workflow',
  title: 'Official workflow',
  type: ListingType.WORKFLOW,
} satisfies IListingPreview;

const createCheckoutDto = {
  listingId: 'listing-1',
  successUrl: 'https://app.genfeed.ai/marketplace/success',
} satisfies ICreateCheckoutDto;

const checkoutResponse = {
  sessionId: 'cs_test_123',
  url: 'https://checkout.example/session',
} satisfies ICheckoutResponse;

const claimFreeResponse = {
  message: 'Claimed',
  purchaseId: 'purchase-1',
} satisfies IClaimFreeResponse;

const ownershipResponse = {
  listingId: 'listing-1',
  owned: true,
  purchaseId: 'purchase-1',
} satisfies IOwnershipResponse;

describe('marketplace public integration contract', () => {
  it('accepts a listing preview card payload', () => {
    expect(listingPreview.seller?.slug).toBe('genfeed');
    expect(listingPreview.type).toBe(ListingType.WORKFLOW);
    expect(listingPreview.pricingTier).toBe(PricingTier.FREE);
  });

  it('accepts checkout, claim, and ownership request/response DTOs', () => {
    expect(createCheckoutDto.listingId).toBe(listingPreview.id);
    expect(checkoutResponse.url).toContain('checkout');
    expect(claimFreeResponse.purchaseId).toBe(ownershipResponse.purchaseId);
    expect(ownershipResponse.owned).toBe(true);
  });
});
