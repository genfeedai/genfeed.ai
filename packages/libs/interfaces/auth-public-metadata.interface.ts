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
  scopes?: string[];

  stripeSubscriptionId?: string;
  stripeSubscriptionStatus?: string;
  subscriptionTier?: string;

  isApiKey?: boolean;
  isSuperAdmin: boolean;
}
