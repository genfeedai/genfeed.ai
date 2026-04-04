export enum SubscriptionCategory {
  MONTHLY = 'monthly',
  PAYG = 'payg',
}

export enum SubscriptionPlan {
  MONTHLY = 'monthly',
  YEARLY = 'yearly',
  PAYG = 'payg',
  ENTERPRISE = 'enterprise',
}

/**
 * Premium pricing tiers (output-based, not credit-based)
 * See: https://github.com/genfeedai/cloud/issues?q=is%3Aissue+pricing
 */
export enum SubscriptionTier {
  FREE = 'free',
  BYOK = 'byok', // Bring Your Own Key — free tier
  CREATOR = 'creator', // $50/month - 5 videos, 50 images, 15 min voice (UNLISTED)
  PRO = 'pro', // $499/month - 30 videos, 500 images, 60 min voice
  SCALE = 'scale', // $1,499/month - 100 videos, 2,000 images, 200 min voice
  ENTERPRISE = 'enterprise', // $4,999/month - Unlimited
}

export enum ByokBillingStatus {
  ACTIVE = 'active',
  PAST_DUE = 'past_due',
  SUSPENDED = 'suspended',
}

export enum SubscriptionStatus {
  ACTIVE = 'active',
  TRIALING = 'trialing',
  PAST_DUE = 'past-due',
  CANCELED = 'canceled',
  INCOMPLETE = 'incomplete',
  INCOMPLETE_EXPIRED = 'incomplete-expired',
  UNPAID = 'unpaid',
  PAUSED = 'paused',
}
