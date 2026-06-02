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

export function parseIntegrationRetryAfterMs(
  retryAfter: string | null,
  now: Date = new Date(),
): number | undefined {
  if (!retryAfter) {
    return undefined;
  }

  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000;
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
  const retryAfterHeader =
    config.retryAfterHeaders
      .map((header) => input.headers?.get(header) ?? null)
      .find((value): value is string => Boolean(value)) ?? null;
  const retryAfterMs = parseIntegrationRetryAfterMs(
    retryAfterHeader,
    input.now,
  );

  if (retryAfterMs !== undefined) {
    return retryAfterMs;
  }

  return config.baseDelayMs * 2 ** Math.max(0, input.attempt - 1);
}
