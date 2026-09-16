import {
  classifyStripeFailure,
  getStripeErrorCode,
  type StripeFailureCategory,
} from '@api/services/integrations/stripe/services/stripe-error.util';

/**
 * The fields the Stripe SDK puts on its error classes that are safe to read
 * and safe to log. `raw`, `headers` and `message` are deliberately absent:
 * they carry request metadata and provider prose that must never reach a log
 * line or a response body.
 */
type StripeLikeError = {
  param?: unknown;
  requestId?: unknown;
  statusCode?: unknown;
  type?: unknown;
};

/** Stripe error types that mean "we asked wrongly", never "try again". */
const NON_TRANSIENT_STRIPE_TYPES: ReadonlySet<string> = new Set([
  'StripeAPIError',
  'StripeAuthenticationError',
  'StripeIdempotencyError',
  'StripePermissionError',
]);

export type SubscriptionFailureCategory =
  | StripeFailureCategory
  | 'local_state'
  | 'unknown';

function asStripeLikeError(error: unknown): StripeLikeError | null {
  return error && typeof error === 'object' ? (error as StripeLikeError) : null;
}

export function getStripeStatusCode(error: unknown): number | undefined {
  const statusCode = asStripeLikeError(error)?.statusCode;
  return typeof statusCode === 'number' ? statusCode : undefined;
}

export function getStripeErrorType(error: unknown): string | undefined {
  const type = asStripeLikeError(error)?.type;
  return typeof type === 'string' ? type : undefined;
}

export function getStripeErrorParam(error: unknown): string | undefined {
  const param = asStripeLikeError(error)?.param;
  return typeof param === 'string' ? param : undefined;
}

export function getStripeRequestId(error: unknown): string | undefined {
  const requestId = asStripeLikeError(error)?.requestId;
  return typeof requestId === 'string' ? requestId : undefined;
}

/** True when the error came back from Stripe rather than from our own code. */
export function isStripeError(error: unknown): boolean {
  return (
    getStripeErrorType(error) !== undefined ||
    getStripeErrorCode(error) !== undefined ||
    getStripeStatusCode(error) !== undefined
  );
}

export function isNonTransientStripeErrorType(error: unknown): boolean {
  const type = getStripeErrorType(error);
  return type !== undefined && NON_TRANSIENT_STRIPE_TYPES.has(type);
}

/**
 * Stripe wraps its own 5xx as a generic `StripeAPIError`, which is an outage
 * worth one bounded retry — unlike the same class on a 4xx.
 */
export function isStripeServerFault(error: unknown): boolean {
  const statusCode = getStripeStatusCode(error);
  return statusCode !== undefined && statusCode >= 500;
}

export { classifyStripeFailure, getStripeErrorCode };
