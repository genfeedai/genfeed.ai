export interface IPayload {
  id: string;

  email: string;
  organization: string;

  stripeSubscriptionId: string;
  stripeCustomerId: string;

  subscription: string;

  version: string;
  isDeleted: boolean;

  isFirstLogin?: boolean;
}
