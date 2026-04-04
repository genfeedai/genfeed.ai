export interface IRequestContext {
  userId: string;
  organizationId: string;
  brandId?: string;
  isSuperAdmin: boolean;
  subscriptionTier: string;
  stripeSubscriptionStatus: string;
  hydratedAt: number;
}
