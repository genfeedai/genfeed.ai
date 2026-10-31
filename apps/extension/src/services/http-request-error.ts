export type HttpFailureKind = 'timeout' | 'network' | 'unauthorized' | 'http';

/**
 * A failed Genfeed API request. `kind` and `status` are what callers decide on
 * (retry, recover, fall back); the message is what a person reads.
 */
export class HttpRequestError extends Error {
  constructor(
    message: string,
    readonly kind: HttpFailureKind,
    /** HTTP status, or null when no response arrived (network failure, timeout). */
    readonly status: number | null,
  ) {
    super(message);
    this.name = 'HttpRequestError';
  }
}
