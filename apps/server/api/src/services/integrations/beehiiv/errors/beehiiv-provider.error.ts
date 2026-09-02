export type BeehiivProviderErrorCode =
  | 'authorization_failed'
  | 'rate_limited'
  | 'transient_failure'
  | 'validation_failed';

export class BeehiivProviderError extends Error {
  readonly code: BeehiivProviderErrorCode;
  readonly isRetryable: boolean;
  readonly statusCode?: number;

  constructor(
    code: BeehiivProviderErrorCode,
    message: string,
    options: { isRetryable: boolean; statusCode?: number },
  ) {
    super(message);
    this.name = BeehiivProviderError.name;
    this.code = code;
    this.isRetryable = options.isRetryable;
    this.statusCode = options.statusCode;
  }
}

function readStatusCode(error: unknown): number | undefined {
  if (!error || typeof error !== 'object' || !('response' in error)) {
    return undefined;
  }

  const response = (error as { response?: unknown }).response;
  if (!response || typeof response !== 'object' || !('status' in response)) {
    return undefined;
  }

  const status = (response as { status?: unknown }).status;
  return typeof status === 'number' ? status : undefined;
}

export function toBeehiivProviderError(error: unknown): BeehiivProviderError {
  if (error instanceof BeehiivProviderError) {
    return error;
  }

  const statusCode = readStatusCode(error);
  if (statusCode === 401 || statusCode === 403) {
    return new BeehiivProviderError(
      'authorization_failed',
      'Beehiiv rejected the connected credential.',
      { isRetryable: false, statusCode },
    );
  }

  if (statusCode === 429) {
    return new BeehiivProviderError(
      'rate_limited',
      'Beehiiv rate limited the request.',
      { isRetryable: true, statusCode },
    );
  }

  if (statusCode !== undefined && statusCode >= 400 && statusCode < 500) {
    return new BeehiivProviderError(
      'validation_failed',
      'Beehiiv rejected the request payload.',
      { isRetryable: false, statusCode },
    );
  }

  return new BeehiivProviderError(
    'transient_failure',
    'Beehiiv is temporarily unavailable.',
    { isRetryable: true, statusCode },
  );
}
