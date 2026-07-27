import type { AnalyticsCollectionFailure } from '@genfeedai/interfaces';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readStatus(error: unknown): number | null {
  const record = asRecord(error);
  const response = asRecord(record?.response);
  const candidates = [record?.status, record?.statusCode, response?.status];

  return (
    candidates.find(
      (candidate): candidate is number =>
        typeof candidate === 'number' && Number.isInteger(candidate),
    ) ?? null
  );
}

export function classifyAnalyticsCollectionError(
  error: unknown,
  platform: string,
): AnalyticsCollectionFailure {
  const status = readStatus(error);
  const label = platform.trim() || 'Provider';

  if (status === 401 || status === 403) {
    return {
      code: 'analytics.authentication_failed',
      isRetryable: false,
      message: `${label} analytics authorization must be refreshed.`,
    };
  }

  if (status === 404) {
    return {
      code: 'analytics.metrics_delayed',
      isRetryable: true,
      message: `${label} has not made analytics available yet.`,
    };
  }

  if (status === 429) {
    return {
      code: 'analytics.rate_limited',
      isRetryable: true,
      message: `${label} analytics is temporarily rate limited.`,
    };
  }

  if (status !== null && status >= 400 && status < 500) {
    return {
      code: 'analytics.collection_failed',
      isRetryable: false,
      message: `${label} analytics could not be collected.`,
    };
  }

  if (status !== null && status >= 500) {
    return {
      code: 'analytics.provider_unavailable',
      isRetryable: true,
      message: `${label} analytics is temporarily unavailable.`,
    };
  }

  return {
    code: 'analytics.collection_failed',
    isRetryable: true,
    message: `${label} analytics could not be collected.`,
  };
}

export function delayedAnalyticsCollectionFailure(
  platform: string,
): AnalyticsCollectionFailure {
  const label = platform.trim() || 'Provider';
  return {
    code: 'analytics.metrics_delayed',
    isRetryable: true,
    message: `${label} has not made analytics available yet.`,
  };
}
