import type { IRequestContext } from '@api/common/interfaces/request-context.interface';
import type { MemberRole } from '@genfeedai/enums';

export interface IAuthenticatedEmailAddress {
  emailAddress?: string | null;
  id?: string | null;
  verification?: {
    status?: string | null;
  } | null;
}

export interface IAuthPublicMetadata {
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
   * Legacy auth provider identifiers retained only while D4 removes historical fields.
   */
  authProviderId?: string;
  authProviderOrganizationId?: string;

  category?: string;
  isOnboardingCompleted?: boolean;
  proactiveLeadId?: string;

  hasEverHadCredits?: boolean;
}

export interface AuthenticatedUser {
  id: string;
  emailAddresses?: IAuthenticatedEmailAddress[];
  firstName?: string | null;
  lastName?: string | null;
  primaryEmailAddressId?: string | null;
  publicMetadata?: Partial<IAuthPublicMetadata>;
}

export interface AuthenticatedRequest {
  context?: IRequestContext;
  user?: AuthenticatedUser;
}
