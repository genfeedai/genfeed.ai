import { isRecord } from '@genfeedai/utils/data/extract.util';

const NON_ERROR_REJECTION_PATTERN =
  /non-error (promise rejection|exception) captured/i;
const ERRORS_KEY_PATTERN = /keys:\s*errors/i;

interface DroppableSentryException {
  readonly type?: string;
  readonly value?: string;
}

interface DroppableSentryEvent {
  exception?: {
    values?: DroppableSentryException[];
  };
}

interface DroppableSentryHint {
  originalException?: unknown;
}

function isJsonApiObjectRejection(value: unknown): boolean {
  return isRecord(value) && Array.isArray(value.errors);
}

function isNonErrorErrorsKeyEvent(event: DroppableSentryEvent): boolean {
  const firstException = event.exception?.values?.[0];
  if (!firstException?.value) {
    return false;
  }

  const isUnhandledObject =
    firstException.type === 'UnhandledRejection' ||
    NON_ERROR_REJECTION_PATTERN.test(firstException.value);

  return isUnhandledObject && ERRORS_KEY_PATTERN.test(firstException.value);
}

/**
 * Drop the raw `{ errors }` unhandledrejection that Sentry captures in
 * parallel with the normalized ServiceOperationError. BaseService already
 * owns the canonical issue.
 */
export function dropUnhandledJsonApiObjectRejection<
  TEvent extends DroppableSentryEvent,
>(event: TEvent, hint: DroppableSentryHint): TEvent | null {
  if (hint.originalException instanceof Error) {
    return event;
  }

  if (isJsonApiObjectRejection(hint.originalException)) {
    return null;
  }

  if (isNonErrorErrorsKeyEvent(event)) {
    return null;
  }

  return event;
}
