import { isObjectLike } from '@genfeedai/utils/data/extract.util';

function readProviderStatus(error: unknown): unknown {
  if (!isObjectLike(error)) {
    return undefined;
  }
  return error.status ?? error.code ?? error.statusCode;
}

/**
 * X answers `dm_events` with 403 when the token's grant has no `dm.read`,
 * which is the case for every account connected before the scope was
 * requested and whose grant predates scope capture.
 */
export function isProviderForbidden(error: unknown): boolean {
  const status = readProviderStatus(error);
  return status === 403 || status === '403';
}

export function isProviderRateLimit(error: unknown): boolean {
  if (!isObjectLike(error)) {
    return false;
  }

  const status = readProviderStatus(error);
  if (status === 429 || status === '429') {
    return true;
  }

  const message =
    typeof error.message === 'string' ? error.message.toLowerCase() : '';
  return (
    message.includes('429') ||
    message.includes('rate limit') ||
    message.includes('too many requests') ||
    isObjectLike(error.rateLimit)
  );
}
