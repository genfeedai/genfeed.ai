export type AuthorizedSignalsSettledResult<T> = {
  error?: unknown;
  value?: T;
};

type RetryProviderRequestOptions = {
  getDelayMs: (error: unknown, attempt: number) => number;
  isRetryable: (error: unknown) => boolean;
  maxAttempts: number;
  sleep?: (delayMs: number) => Promise<void>;
};

const sleep = (delayMs: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, delayMs));

/** Shared retry loop for authorized-signal provider reads. */
export async function retryProviderRequest<T>(
  request: () => Promise<T>,
  options: RetryProviderRequestOptions,
): Promise<T> {
  if (!Number.isSafeInteger(options.maxAttempts) || options.maxAttempts < 1) {
    throw new RangeError('maxAttempts must be a positive safe integer');
  }

  const wait = options.sleep ?? sleep;
  let lastError: unknown;
  for (let attempt = 0; attempt < options.maxAttempts; attempt += 1) {
    try {
      return await request();
    } catch (error: unknown) {
      lastError = error;
      if (!options.isRetryable(error) || attempt === options.maxAttempts - 1) {
        throw error;
      }
      await wait(options.getDelayMs(error, attempt));
    }
  }

  throw lastError;
}

/** Converts an optional provider request into evidence-friendly value/error data. */
export async function settleProviderRequest<T>(
  promise: Promise<T> | undefined,
): Promise<AuthorizedSignalsSettledResult<T>> {
  if (!promise) {
    return {};
  }
  try {
    return { value: await promise };
  } catch (error: unknown) {
    return { error };
  }
}
