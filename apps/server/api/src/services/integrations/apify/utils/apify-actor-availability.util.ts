import { ServiceUnavailableException } from '@nestjs/common';

/** How long an actor that Apify answered 404 for is left alone. */
const APIFY_ACTOR_UNAVAILABLE_MS = 60 * 60 * 1000;

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
 * Remembers actors Apify answered 404 for, so a scheduled caller does not
 * call the same unavailable actor on every tick.
 */
export class ApifyActorAvailabilityTracker {
  private readonly unavailableUntilMs = new Map<string, number>();

  markUnavailable(scope: string, actorId: string, now = Date.now()): number {
    const until = now + APIFY_ACTOR_UNAVAILABLE_MS;
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
