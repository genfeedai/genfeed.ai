import type { SubscriptionCategory, SubscriptionStatus } from '../..';
import type {
  IBrand,
  IIdentifiable,
  IOrganization,
  IUrlResponse,
  IUser,
} from '../index';

export interface ISubscriptionPreview {
  price: string;
}

export interface ISubscription extends IIdentifiable {
  organization: IOrganization;
  brand?: IBrand;
  user: IUser;

  category: string;

  stripeSubscriptionId: string;
  stripeCustomerId: string;
  stripePriceId: string;

  status: SubscriptionStatus;
  currentPeriodEnd?: string;
  isDeleted: boolean;
}

export interface CreateCheckoutSessionDto {
  quantity: number | null;
  stripePriceId: string | undefined;
  successUrl?: string;
  cancelUrl?: string;
}

export type ICheckoutSessionResponse = IUrlResponse;

export type IBillingPortalResponse = IUrlResponse;

export interface SubscriptionStatusResponse {
  isSubscriptionActive: boolean;
  subscriptionType: SubscriptionCategory | null;
  status: string | null;
  currentPeriodEnd: string | null;
}

export interface PayAsYouGoCheckoutDto {
  credits: number;
  amount: number;
}

export interface SubscriptionMetadata {
  isSubscriptionActive: boolean;
  subscriptionType: SubscriptionCategory | null;
  status: SubscriptionStatus | null;
  currentPeriodEnd: string | null;
  isTrialing: boolean;
  isPastDue: boolean;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  priceId?: string;
}

/**
 * One organization's billing state for the superadmin Subscriptions list
 * (GET /subscriptions/admin/billing). Computed, not a serialized entity —
 * every organization appears, with `hasSubscription: false` and a null
 * `status` when it never went through Stripe checkout.
 */
export interface IOrganizationBilling {
  organizationId: string;
  organizationName: string;
  ownerEmail: string | null;
  hasSubscription: boolean;
  tier: string | null;
  plan: string | null;
  status: SubscriptionStatus | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  currentPeriodEnd: string | null;
  balance: number;
  planLimit: number;
  usedCredits: number;
  usedPercent: number;
  remainingPercent: number;
  isMaxedOut: boolean;
  isUnderUsing: boolean;
}

export interface OrganizationBillingResponse {
  success: boolean;
  data: IOrganizationBilling[];
  page: number;
  limit: number;
  totalDocs: number;
  totalPages: number;
}

/**
 * What happened to the plan's credit allocation during a plan change. The
 * change itself is durable in every case; `FAILED` means the allocation still
 * needs repair and has been reported for it.
 */
export const SubscriptionPlanChangeCreditsOutcome = {
  /** The reset was attempted and did not complete. */
  FAILED: 'failed',
  /** Credits were reset to the new plan's allocation. */
  RESET: 'reset',
  /** The price did not change, so the allocation was left alone. */
  UNCHANGED: 'unchanged',
  /** The new price carries no resolvable grant, so the balance was left alone. */
  UNRESOLVED: 'unresolved',
} as const;

export type SubscriptionPlanChangeCreditsOutcome =
  (typeof SubscriptionPlanChangeCreditsOutcome)[keyof typeof SubscriptionPlanChangeCreditsOutcome];

/**
 * Result of a completed plan change. Generic over the provider and persistence
 * shapes so the shared contract never depends on the Stripe SDK types.
 */
export interface ISubscriptionPlanChangeResult<
  TProviderSubscription,
  TSubscription,
> {
  creditsOutcome: SubscriptionPlanChangeCreditsOutcome;
  stripeSubscription: TProviderSubscription;
  subscription: TSubscription;
}
