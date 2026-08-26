type StripeLikeError = {
  code?: string;
  name?: string;
  raw?: { code?: string };
  type?: string;
};

export type StripeFailureCategory =
  | 'configuration'
  | 'customer_missing'
  | 'provider_rejected'
  | 'provider_unavailable';

export class StripeBillingConfigurationError extends Error {
  constructor() {
    super('Production subscription price configuration is invalid');
    this.name = 'StripeBillingConfigurationError';
  }
}

function asStripeLikeError(error: unknown): StripeLikeError | null {
  if (!error || typeof error !== 'object') {
    return null;
  }

  return error as StripeLikeError;
}

export function getStripeErrorCode(error: unknown): string | undefined {
  const candidate = asStripeLikeError(error);
  return candidate?.code ?? candidate?.raw?.code;
}

export function isStripeResourceMissingError(error: unknown): boolean {
  return getStripeErrorCode(error) === 'resource_missing';
}

export function isStripeSignatureVerificationError(error: unknown): boolean {
  const candidate = asStripeLikeError(error);
  return (
    candidate?.type === 'StripeSignatureVerificationError' ||
    candidate?.name === 'StripeSignatureVerificationError'
  );
}

export function classifyStripeFailure(error: unknown): StripeFailureCategory {
  const code = getStripeErrorCode(error);
  const type = asStripeLikeError(error)?.type;
  if (code === 'resource_missing') {
    return 'customer_missing';
  }
  if (
    code === 'rate_limit' ||
    code === 'api_connection_error' ||
    type === 'StripeConnectionError' ||
    type === 'StripeRateLimitError'
  ) {
    return 'provider_unavailable';
  }
  if (error instanceof StripeBillingConfigurationError) {
    return 'configuration';
  }
  return 'provider_rejected';
}
