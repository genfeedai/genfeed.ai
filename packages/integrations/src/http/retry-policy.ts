import type { IntegrationProviderRetryConfig } from '../catalog';

export const DEFAULT_INTEGRATION_RETRY_CONFIG: IntegrationProviderRetryConfig =
  {
    baseDelayMs: 500,
    maxAttempts: 3,
    retryAfterHeaders: ['retry-after', 'x-rate-limit-reset'],
    retryableStatusCodes: [408, 425, 429, 500, 502, 503, 504],
  };

export function isRetryableIntegrationStatus(
  status: number,
  config: IntegrationProviderRetryConfig = DEFAULT_INTEGRATION_RETRY_CONFIG,
): boolean {
  return config.retryableStatusCodes.includes(status);
}

/**
 * Headers that carry an absolute Unix epoch timestamp (seconds since 1970-01-01).
 * These must be converted to a relative delay by subtracting the current time.
 */
const EPOCH_RETRY_HEADERS = new Set(['x-rate-limit-reset']);

export function parseIntegrationRetryAfterMs(
  retryAfter: string | null,
  now: Date = new Date(),
  headerName?: string,
): number | undefined {
  if (!retryAfter) {
    return undefined;
  }

  const numeric = Number(retryAfter);

  if (Number.isFinite(numeric) && numeric >= 0) {
    if (headerName && EPOCH_RETRY_HEADERS.has(headerName.toLowerCase())) {
      // Absolute Unix epoch in seconds — convert to relative ms delay.
      return Math.max(0, numeric * 1000 - now.getTime());
    }
    // Relative seconds (RFC 7231 Retry-After).
    return numeric * 1000;
  }

  const date = new Date(retryAfter);
  if (!Number.isFinite(date.getTime())) {
    return undefined;
  }

  return Math.max(0, date.getTime() - now.getTime());
}

export function getIntegrationRetryDelayMs(input: {
  attempt: number;
  config?: IntegrationProviderRetryConfig;
  headers?: Headers;
  now?: Date;
}): number {
  const config = input.config ?? DEFAULT_INTEGRATION_RETRY_CONFIG;
  const retryAfterEntry =
    config.retryAfterHeaders
      .map((header) => ({
        name: header,
        value: input.headers?.get(header) ?? null,
      }))
      .find((entry): entry is { name: string; value: string } =>
        Boolean(entry.value),
      ) ?? null;
  const retryAfterMs = parseIntegrationRetryAfterMs(
    retryAfterEntry?.value ?? null,
    input.now,
    retryAfterEntry?.name,
  );

  if (retryAfterMs !== undefined) {
    return retryAfterMs;
  }

  return config.baseDelayMs * 2 ** Math.max(0, input.attempt - 1);
}
