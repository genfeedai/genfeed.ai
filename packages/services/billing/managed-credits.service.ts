import type {
  CreateManagedCreditsCheckoutInput,
  ManagedCreditsCheckoutResult,
  ManagedCreditsProvisioningResult,
} from '@genfeedai/interfaces';
import { EnvironmentService } from '@services/core/environment.service';

export type {
  CreateManagedCreditsCheckoutInput,
  ManagedCreditsCheckoutResult,
  ManagedCreditsProvisioningResult,
} from '@genfeedai/interfaces';

export class ManagedCreditsApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ManagedCreditsApiError';
  }
}

export function isManagedCreditsTransientError(error: unknown): boolean {
  if (!(error instanceof ManagedCreditsApiError)) {
    return false;
  }

  return (
    error.status === 408 ||
    error.status === 409 ||
    error.status === 425 ||
    error.status === 429 ||
    (error.status >= 500 && error.status <= 504)
  );
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
    signal?: AbortSignal,
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
        signal,
      },
    );

    const payload = await parseJson(response);

    if (!response.ok) {
      throw new ManagedCreditsApiError(
        readErrorMessage(payload, 'Failed to create managed credits checkout'),
        response.status,
      );
    }

    const document = payload as JsonApiDocument<ManagedCreditsCheckoutResult>;
    const result = document.data?.attributes;

    if (!result?.url) {
      throw new ManagedCreditsApiError(
        'Managed credits checkout did not return a Stripe URL',
        response.status,
      );
    }

    return result;
  },

  async getCheckoutResult(
    sessionId: string,
    signal?: AbortSignal,
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
        signal,
      },
    );

    const payload = await parseJson(response);

    if (!response.ok) {
      throw new ManagedCreditsApiError(
        readErrorMessage(payload, 'Managed credits checkout result not found'),
        response.status,
      );
    }

    return payload as ManagedCreditsProvisioningResult;
  },
};
