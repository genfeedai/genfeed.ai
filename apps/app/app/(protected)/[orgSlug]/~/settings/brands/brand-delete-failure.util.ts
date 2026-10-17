import { isServiceOperationError } from '@services/core/operation-error';

const DELETE_FAILED_MESSAGE = 'Failed to delete brand';

/** The API refused the delete on purpose; the same request is refused again. */
const REFUSED_STATUSES = new Set([400, 403, 404, 409, 422]);

/** Refusals whose message tells the user what to do (the last brand, etc.). */
const ACTIONABLE_STATUSES = new Set([400, 409, 422]);

/**
 * How a failed brand delete should surface. A refusal such as "Cannot delete
 * an organization's last brand" is an expected answer to a user action, so it
 * is shown to the user without being reported to Sentry as an exception.
 */
export function describeBrandDeleteFailure(error: unknown): {
  isExpected: boolean;
  message: string;
} {
  if (!isServiceOperationError(error) || error.status === undefined) {
    return { isExpected: false, message: DELETE_FAILED_MESSAGE };
  }

  const message = error.message.trim();
  return {
    isExpected: REFUSED_STATUSES.has(error.status),
    message:
      ACTIONABLE_STATUSES.has(error.status) && message.length > 0
        ? message
        : DELETE_FAILED_MESSAGE,
  };
}
