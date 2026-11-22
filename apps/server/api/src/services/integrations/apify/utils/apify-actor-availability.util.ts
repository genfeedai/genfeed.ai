import { ServiceUnavailableException } from '@nestjs/common';

/** How long an actor that Apify answered 404 for is left alone. */
const APIFY_ACTOR_UNAVAILABLE_MS = 60 * 60 * 1000;

/**
 * How long an actor whose run overran the wait budget is left alone. A run
 * that is still going after two minutes means Apify is slow for that actor, so
 * the next scheduled tick does not start another one on top of it.
 */
export const APIFY_ACTOR_RUN_TIMEOUT_HOLD_MS = 15 * 60 * 1000;

/**
 * Thrown when Apify refuses to start an actor because it does not exist for
 * the token (removed, renamed, or not accessible). The message names the
 * capability the caller asked for, never the actor id or the token.
 */
export class ApifyActorUnavailableException extends ServiceUnavailableException {
  constructor(capability: string, unavailableUntilMs: number) {
    super(
      `Apify actor for ${capability} is unavailable. Not retrying until ${new Date(unavailableUntilMs).toISOString()}.`,
    );
  }
}

/**
 * Thrown when an accepted actor run is still going after the wait budget. It
 * is Apify being slow, not a defect in the caller: callers treat it like an
 * unavailable actor (degraded result, warning, no error-level report).
 */
export class ApifyActorRunTimeoutException extends ServiceUnavailableException {
  constructor(
    readonly runId: string,
    readonly maxWaitMs: number,
  ) {
    super(`Actor run ${runId} timed out after ${maxWaitMs}ms`);
  }
}

/** A held-off or timed-out actor: expected upstream slowness, not an error. */
export function isApifyActorDeferral(error: unknown): boolean {
  return (
    error instanceof ApifyActorUnavailableException ||
    error instanceof ApifyActorRunTimeoutException
  );
}

export const APIFY_ACTOR_NOT_FOUND_STATUS = 404;

/**
 * `validateStatus` for the actor-start request: a 404 is a classified result
 * the caller handles, not a transport error for the shared interceptor.
 */
export function isApifyStartAccepted(status: number): boolean {
  return (
    (status >= 200 && status < 300) || status === APIFY_ACTOR_NOT_FOUND_STATUS
  );
}

/**
 * Remembers actors Apify answered 404 for, or whose run overran the wait
 * budget, so a scheduled caller does not call them again on every tick.
 */
export class ApifyActorAvailabilityTracker {
  private readonly unavailableUntilMs = new Map<string, number>();

  markUnavailable(
    scope: string,
    actorId: string,
    now = Date.now(),
    holdMs = APIFY_ACTOR_UNAVAILABLE_MS,
  ): number {
    const until = now + holdMs;
    this.unavailableUntilMs.set(`${scope}:${actorId}`, until);
    return until;
  }

  /** Returns the time the hold ends, or null once the actor may be tried. */
  getHoldUntil(
    scope: string,
    actorId: string,
    now = Date.now(),
  ): number | null {
    const key = `${scope}:${actorId}`;
    const until = this.unavailableUntilMs.get(key);
    if (until === undefined) return null;
    if (now >= until) {
      this.unavailableUntilMs.delete(key);
      return null;
    }
    return until;
  }
}
