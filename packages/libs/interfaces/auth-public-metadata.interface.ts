import type { MemberRole } from '@genfeedai/enums';

export interface IAuthPublicMetadata {
  user: string;
  /**
   * Present for multi-tenant (SaaS/Enterprise) deployments; undefined in
   * single-tenant (community/desktop) deployments where no organization is
   * associated with the session. Always check for presence before using in
   * queries — the video and image generation services use `|| fallback` or
   * conditional spreads to handle the single-tenant case.
   */
  organization: string | undefined;
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
   * Optional legacy auth provider user identifier for websocket routing.
   */
  authProviderId?: string;

  /** legacy auth provider native organization ID (org_xxx) for cross-reference with legacy auth provider organizations. */
  authProviderOrganizationId?: string;

  category?: string;
  isOnboardingCompleted?: boolean;
  proactiveLeadId?: string;

  hasEverHadCredits?: boolean;
}
