import type { AnalyticsCollectionFailure } from '@genfeedai/contracts/interfaces';
import { readRecordOrNull } from '@genfeedai/utils/data/extract.util';

function readStatus(error: unknown): number | null {
  const record = readRecordOrNull(error);
  const response = readRecordOrNull(record?.response);
  const candidates = [record?.status, record?.statusCode, response?.status];

  return (
    candidates.find(
      (candidate): candidate is number =>
        typeof candidate === 'number' && Number.isInteger(candidate),
    ) ?? null
  );
}

const AUTHORIZATION_PROVIDER_REASONS: ReadonlySet<string> = new Set([
  'authError',
  'invalid_grant',
  'invalid_token',
  'invalidCredentials',
  'unauthorized',
]);

/**
 * Provider reasons that mean the stored authorization is no longer usable,
 * whatever status carried them: an OAuth token endpoint answers a revoked
 * grant with HTTP 400 `invalid_grant`, which is not a malformed request.
 */
function hasAuthorizationProviderReason(error: unknown): boolean {
  const body = readRecordOrNull(
    readRecordOrNull(readRecordOrNull(error)?.response)?.data,
  );
  const nested = readRecordOrNull(body?.error);
  const reasons = [
    body?.error,
    nested?.status,
    ...(Array.isArray(nested?.errors)
      ? nested.errors.map((entry) => readRecordOrNull(entry)?.reason)
      : []),
  ];
  return reasons.some(
    (reason) =>
      typeof reason === 'string' && AUTHORIZATION_PROVIDER_REASONS.has(reason),
  );
}

export function classifyAnalyticsCollectionError(
  error: unknown,
  platform: string,
): AnalyticsCollectionFailure {
  const record = readRecordOrNull(error);
  const attributed = readRecordOrNull(record?.analyticsFailure);
  if (
    attributed &&
    typeof attributed.code === 'string' &&
    typeof attributed.message === 'string' &&
    typeof attributed.isRetryable === 'boolean'
  ) {
    return {
      code: attributed.code,
      isRetryable: attributed.isRetryable,
      message: attributed.message,
    };
  }

  const status = readStatus(error);
  const label = platform.trim() || 'Provider';

  if (
    status === 401 ||
    status === 403 ||
    hasAuthorizationProviderReason(error)
  ) {
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
