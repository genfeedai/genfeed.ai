import type { MemberRole } from '@genfeedai/enums';

export interface IClerkPublicMetadata {
  user: string;
  organization: string;
  brand: string;
  balance?: number;
  role?: MemberRole;

  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  stripeSubscriptionStatus?: string;
  stripePriceId?: string;
  subscriptionTier?: string;

  isSuperAdmin: boolean;

  /**
   * Optional Clerk user identifier for websocket routing.
   */
  clerkId?: string;

  category?: string;
  isOnboardingCompleted?: boolean;

  hasEverHadCredits?: boolean;
}
