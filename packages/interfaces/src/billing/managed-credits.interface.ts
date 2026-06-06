export interface CreateManagedCreditsCheckoutInput {
  cancelUrl?: string;
  email: string;
  firstName?: string;
  lastName?: string;
  quantity?: number;
  stripePriceId?: string;
  successUrl?: string;
}

export interface ManagedCreditsCheckoutResult {
  url: string;
}

export interface ManagedCreditsProvisioningResult {
  apiKey: string | null;
  apiKeyAlreadyExists: boolean;
  brandId: string;
  email: string;
  organizationId: string;
  userId: string;
}
