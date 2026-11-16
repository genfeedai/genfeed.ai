import { PublishErrorKind } from '../../enums/publish-error-kind.enum';

export interface PublishErrorOptions {
  /** The provider's own error code, read from its response. */
  providerCode?: string;
  /** HTTP status of the provider response, when there was one. */
  httpStatus?: number;
  /** For `RATE_LIMITED`: how long the provider said to wait. */
  retryAfterMs?: number;
  /** For `RATE_LIMITED`: when the provider said the limit resets. */
  resetAt?: Date;
  cause?: unknown;
}

/**
 * The one error a publisher reports. The publisher is the only place that
 * knows what its provider's response means, so it picks the kind from the HTTP
 * status and the provider's documented error code, never from a rendered
 * message.
 */
export class PublishError extends Error {
  readonly kind: PublishErrorKind;
  readonly providerCode?: string;
  readonly httpStatus?: number;
  readonly retryAfterMs?: number;
  readonly resetAt?: Date;
  /** The provider response or thrown error this was built from. */
  readonly cause?: unknown;

  constructor(
    kind: PublishErrorKind,
    message: string,
    options: PublishErrorOptions = {},
  ) {
    super(message);
    this.name = 'PublishError';
    this.kind = kind;
    this.providerCode = options.providerCode;
    this.httpStatus = options.httpStatus;
    this.retryAfterMs = options.retryAfterMs;
    this.resetAt = options.resetAt;
    this.cause = options.cause;
  }
}

const PUBLISH_ERROR_KINDS: ReadonlySet<string> = new Set(
  Object.values(PublishErrorKind),
);

/**
 * The kind a failure carries, or null when it carries none. Matches on the
 * shape instead of `instanceof`, which fails when two copies of this package
 * are loaded.
 */
export function readPublishErrorKind(error: unknown): PublishErrorKind | null {
  if (typeof error !== 'object' || error === null) return null;
  const { kind, name } = error as { kind?: unknown; name?: unknown };
  return name === 'PublishError' &&
    typeof kind === 'string' &&
    PUBLISH_ERROR_KINDS.has(kind)
    ? (kind as PublishErrorKind)
    : null;
}

export function isPublishError(error: unknown): error is PublishError {
  return readPublishErrorKind(error) !== null;
}
