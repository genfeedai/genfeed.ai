import type { MemberRole } from '@genfeedai/enums';

export interface IClerkPublicMetadata {
  user: string;
  organization: string;
  brand: string;
  apiKeyId?: string;
  balance?: number;
  role?: MemberRole;
  scopes?: string[];

  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  stripeSubscriptionStatus?: string;
  stripePriceId?: string;
  subscriptionTier?: string;

  isApiKey?: boolean;
  isSuperAdmin: boolean;

  /**
   * Optional Clerk user identifier for websocket routing.
   */
  clerkId?: string;

  category?: string;
  isOnboardingCompleted?: boolean;

  hasEverHadCredits?: boolean;
}
