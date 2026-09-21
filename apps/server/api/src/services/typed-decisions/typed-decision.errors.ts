/**
 * Internal provider failures (#4864). Both are caught by TypedDecisionService
 * and turned into `null` — they never reach a call site.
 */

/** The provider exceeded the request budget. */
export class TypedDecisionTimeoutError extends Error {
  constructor(public readonly timeoutMs: number) {
    super(`Typed decision timed out after ${timeoutMs}ms`);
    this.name = 'TypedDecisionTimeoutError';
  }
}

/**
 * The vendor returned 429. `retryAfterSeconds` is the cooldown it asked for;
 * the adapter honours it instead of retrying inside the request budget.
 */
export class TypedDecisionRateLimitError extends Error {
  constructor(public readonly retryAfterSeconds: number) {
    super(`Typed decision provider is rate limited for ${retryAfterSeconds}s`);
    this.name = 'TypedDecisionRateLimitError';
  }
}
