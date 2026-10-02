import {
  DirectMediaProviderError,
  type DirectMediaTransport,
} from '@api/services/integrations/direct-media/direct-media.types';

/** No automatic POST retries or redirects: either can duplicate spend or disclose keys. */
async function requestDirectMediaResponse(
  transport: DirectMediaTransport,
  url: string,
  init: RequestInit,
  timeoutMs = 30_000,
): Promise<Response> {
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 180_000) {
    throw new DirectMediaProviderError(
      'PROVIDER_TIMEOUT_INVALID',
      'Provider request timeout is invalid.',
    );
  }
  const isSubmission = init.method === 'POST' && !url.endsWith('/cancel');
  const timeout = AbortSignal.timeout(timeoutMs);
  const signal = init.signal
    ? AbortSignal.any([init.signal, timeout])
    : timeout;
  let response: Response;
  let hasStartedRequest = false;
  try {
    signal.throwIfAborted();
    hasStartedRequest = true;
    response = await transport(url, { ...init, redirect: 'error', signal });
  } catch {
    throw new DirectMediaProviderError(
      'PROVIDER_CONNECTION_FAILED',
      'Provider request could not be confirmed. Check the existing job before retrying.',
      isSubmission && hasStartedRequest,
    );
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    const code =
      response.status === 401 || response.status === 403
        ? 'PROVIDER_ACCESS_DENIED'
        : response.status === 402
          ? 'PROVIDER_CREDIT_REQUIRED'
          : response.status === 429
            ? 'PROVIDER_RATE_LIMITED'
            : response.status >= 500
              ? 'PROVIDER_UNAVAILABLE'
              : 'PROVIDER_REQUEST_REJECTED';
    throw new DirectMediaProviderError(
      code,
      'Provider request failed.',
      isSubmission && response.status >= 500,
      response.status,
    );
  }
  return response;
}

/** Runway task deletion documents no JSON result. */
export async function requestDirectMediaEmpty(
  transport: DirectMediaTransport,
  url: string,
  init: RequestInit,
): Promise<void> {
  const response = await requestDirectMediaResponse(transport, url, init);
  await response.body?.cancel().catch(() => undefined);
}

export async function requestDirectMediaJson(
  transport: DirectMediaTransport,
  url: string,
  init: RequestInit,
  timeoutMs = 30_000,
): Promise<unknown> {
  const response = await requestDirectMediaResponse(
    transport,
    url,
    init,
    timeoutMs,
  );
  try {
    return await response.json();
  } catch {
    throw new DirectMediaProviderError(
      'PROVIDER_RESPONSE_INVALID',
      'Provider returned an unreadable response.',
      init.method === 'POST' && !url.endsWith('/cancel'),
    );
  }
}
