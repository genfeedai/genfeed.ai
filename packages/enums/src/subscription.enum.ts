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
 * Subscription tiers (credit-based)
 * See: https://github.com/genfeedai/cloud/issues?q=is%3Aissue+pricing
 */
export enum SubscriptionTier {
  FREE = 'free',
  BYOK = 'byok', // Bring Your Own Key — free tier
  PRO = 'pro', // $49/month - Pro/"Creator" card, 8,000 credits
  SCALE = 'scale', // $499/month - Scale/"Cloud Teams" card, 80,000 credits
  ENTERPRISE = 'enterprise', // custom
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
