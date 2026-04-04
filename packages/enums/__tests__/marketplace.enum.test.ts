import { describe, expect, it } from 'vitest';
import {
  ListingStatus,
  ListingType,
  PayoutStatus,
  PricingTier,
  PurchaseStatus,
  ReviewStatus,
  SellerBadgeTier,
  SellerStatus,
} from '../src/marketplace.enum';

describe('marketplace.enum', () => {
  describe('ListingType', () => {
    it('should have 4 members', () => {
      expect(Object.values(ListingType)).toHaveLength(4);
    });

    it('should have correct values', () => {
      expect(ListingType.WORKFLOW).toBe('workflow');
      expect(ListingType.PROMPT).toBe('prompt');
      expect(ListingType.PRESET).toBe('preset');
      expect(ListingType.SKILL).toBe('skill');
    });
  });

  describe('ListingStatus', () => {
    it('should have 5 members', () => {
      expect(Object.values(ListingStatus)).toHaveLength(5);
    });

    it('should have correct values', () => {
      expect(ListingStatus.DRAFT).toBe('draft');
      expect(ListingStatus.PENDING_REVIEW).toBe('pending_review');
      expect(ListingStatus.PUBLISHED).toBe('published');
      expect(ListingStatus.REJECTED).toBe('rejected');
      expect(ListingStatus.ARCHIVED).toBe('archived');
    });
  });

  describe('SellerBadgeTier', () => {
    it('should have 3 members', () => {
      expect(Object.values(SellerBadgeTier)).toHaveLength(3);
    });

    it('should have correct values', () => {
      expect(SellerBadgeTier.NEW).toBe('new');
      expect(SellerBadgeTier.VERIFIED).toBe('verified');
      expect(SellerBadgeTier.TOP_SELLER).toBe('top_seller');
    });
  });

  describe('SellerStatus', () => {
    it('should have 3 members', () => {
      expect(Object.values(SellerStatus)).toHaveLength(3);
    });

    it('should have correct values', () => {
      expect(SellerStatus.PENDING).toBe('pending');
      expect(SellerStatus.APPROVED).toBe('approved');
      expect(SellerStatus.SUSPENDED).toBe('suspended');
    });
  });

  describe('PurchaseStatus', () => {
    it('should have 6 members', () => {
      expect(Object.values(PurchaseStatus)).toHaveLength(6);
    });

    it('should have correct values', () => {
      expect(PurchaseStatus.PENDING).toBe('pending');
      expect(PurchaseStatus.PROCESSING).toBe('processing');
      expect(PurchaseStatus.COMPLETED).toBe('completed');
      expect(PurchaseStatus.FAILED).toBe('failed');
      expect(PurchaseStatus.REFUNDED).toBe('refunded');
      expect(PurchaseStatus.DISPUTED).toBe('disputed');
    });
  });

  describe('PayoutStatus', () => {
    it('should have 4 members', () => {
      expect(Object.values(PayoutStatus)).toHaveLength(4);
    });

    it('should have correct values', () => {
      expect(PayoutStatus.PENDING).toBe('pending');
      expect(PayoutStatus.PROCESSING).toBe('processing');
      expect(PayoutStatus.COMPLETED).toBe('completed');
      expect(PayoutStatus.FAILED).toBe('failed');
    });
  });

  describe('ReviewStatus', () => {
    it('should have 3 members', () => {
      expect(Object.values(ReviewStatus)).toHaveLength(3);
    });

    it('should have correct values', () => {
      expect(ReviewStatus.ACTIVE).toBe('active');
      expect(ReviewStatus.HIDDEN).toBe('hidden');
      expect(ReviewStatus.FLAGGED).toBe('flagged');
    });
  });

  describe('PricingTier', () => {
    it('should have 3 members', () => {
      expect(Object.values(PricingTier)).toHaveLength(3);
    });

    it('should have correct values', () => {
      expect(PricingTier.FREE).toBe('free');
      expect(PricingTier.PAID).toBe('paid');
      expect(PricingTier.PREMIUM).toBe('premium');
    });
  });
});
