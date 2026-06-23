export interface IAuthPublicData {
  user: string;
  organization: string;
  brand: string;

  stripeCustomerId: string;
  stripeSubscriptionId: string;
  stripeSubscriptionStatus: string;
  stripePriceId: string;
  balance?: number;

  isSuperAdmin: boolean;
  subscriptionTier?: string;

  category?: string;
  accountType?: string;
  isOnboardingCompleted?: boolean;

  hasEverHadCredits?: boolean;
}
