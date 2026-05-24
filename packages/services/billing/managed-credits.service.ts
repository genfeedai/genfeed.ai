import { EnvironmentService } from '@services/core/environment.service';

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

interface JsonApiResource<TAttributes> {
  attributes?: TAttributes;
}

interface JsonApiDocument<TAttributes> {
  data?: JsonApiResource<TAttributes>;
  errors?: Array<{ detail?: string; title?: string }>;
}

function joinEndpoint(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/$/, '')}${path}`;
}

function readErrorMessage(payload: unknown, fallback: string): string {
  const document = payload as JsonApiDocument<unknown>;
  const firstError = document.errors?.[0];

  return firstError?.detail || firstError?.title || fallback;
}

async function parseJson(response: Response): Promise<unknown> {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

export const ManagedCreditsService = {
  get apiEndpoint(): string {
    return EnvironmentService.managedCreditsApiEndpoint;
  },

  async createCheckoutSession(
    input: CreateManagedCreditsCheckoutInput,
  ): Promise<ManagedCreditsCheckoutResult> {
    const response = await fetch(
      joinEndpoint(this.apiEndpoint, '/services/stripe/managed/checkout'),
      {
        body: JSON.stringify(input),
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        method: 'POST',
      },
    );

    const payload = await parseJson(response);

    if (!response.ok) {
      throw new Error(
        readErrorMessage(payload, 'Failed to create managed credits checkout'),
      );
    }

    const document = payload as JsonApiDocument<ManagedCreditsCheckoutResult>;
    const result = document.data?.attributes;

    if (!result?.url) {
      throw new Error('Managed credits checkout did not return a Stripe URL');
    }

    return result;
  },

  async getCheckoutResult(
    sessionId: string,
  ): Promise<ManagedCreditsProvisioningResult> {
    const response = await fetch(
      joinEndpoint(
        this.apiEndpoint,
        `/services/stripe/managed/sessions/${encodeURIComponent(sessionId)}`,
      ),
      {
        headers: {
          Accept: 'application/json',
        },
        method: 'GET',
      },
    );

    const payload = await parseJson(response);

    if (!response.ok) {
      throw new Error(
        readErrorMessage(payload, 'Managed credits checkout result not found'),
      );
    }

    return payload as ManagedCreditsProvisioningResult;
  },
};
