import type { IRequestContext } from '@api/common/interfaces/request-context.interface';
import type { ActionOrigin } from '@genfeedai/enums';

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
  actionOrigin?: ActionOrigin;
  scopes?: string[];

  stripeSubscriptionId?: string;
  stripeSubscriptionStatus?: string;
  subscriptionTier?: string;

  isApiKey?: boolean;
  isSuperAdmin: boolean;
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
