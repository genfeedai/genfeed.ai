import { createEntityAttributes } from '@genfeedai/helpers';

export const sellerAttributes = createEntityAttributes([
  'user',
  'organization',
  'displayName',
  'slug',
  'bio',
  'avatar',
  'website',
  'social',
  'stripeOnboardingComplete',
  'payoutEnabled',
  'totalEarnings',
  'totalSales',
  'rating',
  'reviewCount',
  'followerCount',
  'badgeTier',
  'status',
  'createdAt',
  'updatedAt',
]);
