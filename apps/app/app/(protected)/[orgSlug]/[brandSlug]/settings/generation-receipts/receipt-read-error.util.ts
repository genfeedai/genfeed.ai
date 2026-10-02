import { getJsonApiErrorMember } from '@services/core/json-api-error-message';
import { isAxiosError } from 'axios';

function numericStatus(value: unknown): number | undefined {
  return typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 400 &&
    value <= 599
    ? value
    : undefined;
}
function status(error: unknown): number | undefined {
  const object =
    typeof error === 'object' && error !== null && !Array.isArray(error)
      ? error
      : undefined;
  if (object && 'isAuthError' in object && object.isAuthError === true)
    return 401;
  return (
    numericStatus(getJsonApiErrorMember(error)?.status) ??
    numericStatus(object && 'status' in object ? object.status : undefined) ??
    numericStatus(
      object && 'statusCode' in object ? object.statusCode : undefined,
    ) ??
    numericStatus(isAxiosError(error) ? error.response?.status : undefined)
  );
}

export function receiptReadUnavailable(error: unknown): boolean {
  const code = status(error);
  return code === 401 || code === 403 || code === 404;
}
