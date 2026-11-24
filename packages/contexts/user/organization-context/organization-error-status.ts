import { isRecord } from '@genfeedai/contracts/constants/type-guards.constant';
import { getJsonApiErrorMember } from '@genfeedai/services/core/json-api-error-message';

function toHttpStatus(value: unknown): number | undefined {
  return typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 100 &&
    value <= 599
    ? value
    : undefined;
}

/**
 * The numeric HTTP status of a failed request, wherever the rejection carries
 * it: on the error, on its response, or on the first JSON:API error member.
 * Only the number is kept.
 */
export function errorStatusOf(error: unknown): string | undefined {
  if (!isRecord(error)) return undefined;
  const status =
    toHttpStatus(error.status) ??
    toHttpStatus(
      isRecord(error.response) ? error.response.status : undefined,
    ) ??
    toHttpStatus(getJsonApiErrorMember(error)?.status);
  return status === undefined ? undefined : String(status);
}

export function isClientErrorStatus(error: unknown): boolean {
  const status = Number(errorStatusOf(error));
  return status >= 400 && status < 500;
}

export function isCancelledMembershipRead(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const record = error as Record<string, unknown>;
  return (
    record.isCancelled === true ||
    record.code === 'ERR_CANCELED' ||
    record.name === 'CanceledError' ||
    record.name === 'AbortError'
  );
}
