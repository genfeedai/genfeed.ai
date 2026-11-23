const REDDIT_CREDENTIALS_HOLD_MS = 60 * 60 * 1000;

/**
 * Thrown when Reddit rejected the app's client credentials. `status` lets the
 * trend refresh classify it as `authentication_required`, which is the
 * freshness signal an operator reads instead of an error group.
 */
export class RedditAppCredentialsRejectedError extends Error {
  readonly status = 401;

  constructor(heldUntilMs: number) {
    super(
      `Reddit rejected the app credentials. Not retrying until ${new Date(heldUntilMs).toISOString()}.`,
    );
    this.name = 'RedditAppCredentialsRejectedError';
  }
}

/**
 * `validateStatus` for the token request: a 401 is read as a response and
 * classified by the caller, so the shared interceptor does not report it as
 * an error on every scheduled run.
 */
export function isRedditTokenResponseReadable(status: number): boolean {
  return (status >= 200 && status < 300) || status === 401;
}

/** When a rejected credential may be tried again. */
export function redditCredentialsHoldUntil(now: number): number {
  return now + REDDIT_CREDENTIALS_HOLD_MS;
}
