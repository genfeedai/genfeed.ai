import type {
  SubscriptionCategory,
  SubscriptionStatus,
} from '@genfeedai/enums';
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
 * Per-organization credit usage row for the superadmin credit-usage list
 * (GET /subscriptions/admin/credit-usage). Computed, not a serialized entity —
 * mirrors the plain-object contract already used by getCreditsBreakdown.
 */
export interface IOrganizationCreditUsage {
  organizationId: string;
  organizationName: string;
  tier: string | null;
  status: SubscriptionStatus | null;
  balance: number;
  planLimit: number;
  usedCredits: number;
  usedPercent: number;
  remainingPercent: number;
  isMaxedOut: boolean;
  isUnderUsing: boolean;
  currentPeriodEnd: string | null;
}

export interface OrganizationCreditUsageResponse {
  success: boolean;
  data: IOrganizationCreditUsage[];
  page: number;
  limit: number;
  totalDocs: number;
  totalPages: number;
}
