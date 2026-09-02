import type { IRequestContext } from '@api/common/interfaces/request-context.interface';
import type { ActionOrigin } from '@genfeedai/contracts';

export interface IAuthenticatedEmailAddress {
  emailAddress?: string | null;
  id?: string | null;
  verification?: {
    status?: string | null;
  } | null;
}

export interface AuthenticatedUser {
  id: string;
  userId: string;
  organizationId: string;
  brandId: string;
  isSuperAdmin?: boolean;
  apiKeyId?: string;
  actionOrigin?: ActionOrigin;
  scopes?: string[];
  stripeSubscriptionId?: string;
  stripeSubscriptionStatus?: string;
  subscriptionTier?: string;
  isApiKey?: boolean;
  emailAddresses?: IAuthenticatedEmailAddress[];
  firstName?: string | null;
  lastName?: string | null;
  primaryEmailAddressId?: string | null;
}

export interface AuthenticatedRequest {
  context?: IRequestContext;
  user?: AuthenticatedUser;
}
