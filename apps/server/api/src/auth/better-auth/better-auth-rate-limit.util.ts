/**
 * Redis-backed rate-limit store for Better Auth (#1186, #738 criteria 6-7).
 *
 * Extracted from `BetterAuthModule` so the fail-open behavior the PRD requires
 * is exercised by tests against the real adapter rather than a hand-written
 * lookalike.
 */
import type {
  IBetterAuthRateLimitRedisClient,
  IBetterAuthRateLimitStore,
} from './better-auth.types';

/** Which Redis command the store was running when it degraded. */
export type BetterAuthRateLimitOperation = 'get' | 'set';

/** Why a rate-limit operation failed open instead of consulting Redis. */
export type BetterAuthRateLimitDegradationReason =
  /** The client reported `isReady === false`, so no command was issued. */
  | 'client-unavailable'
  /** A command was issued and threw. */
  | 'command-failed';

/** Emitted (throttled) whenever the store fails open instead of enforcing. */
export interface IBetterAuthRateLimitDegradedEvent {
  operation: BetterAuthRateLimitOperation;
  reason: BetterAuthRateLimitDegradationReason;
  /** The thrown value. Present only for `command-failed`. */
  error?: unknown;
  /** Degraded operations swallowed by the throttle since the previous event. */
  suppressedCount: number;
}

/** Emitted once when a Redis command succeeds after a degraded run. */
export interface IBetterAuthRateLimitRecoveredEvent {
  operation: BetterAuthRateLimitOperation;
  /** Total operations that failed open during the outage that just ended. */
  degradedCount: number;
}

export interface IBuildRedisRateLimitStoreOptions {
  /**
   * Minimum gap between two emitted {@link IBetterAuthRateLimitDegradedEvent}s.
   * A sustained outage degrades every single auth request, so the raw signal is
   * as hot as the auth path itself; it is collapsed into one event per window
   * carrying `suppressedCount` instead. Defaults to one minute.
   */
  degradationSignalIntervalMs?: number;
  onDegraded?: (event: IBetterAuthRateLimitDegradedEvent) => void;
  onRecovered?: (event: IBetterAuthRateLimitRecoveredEvent) => void;
}

/** One signal per minute is enough to alert on, cheap enough to never flood. */
const DEFAULT_DEGRADATION_SIGNAL_INTERVAL_MS = 60_000;

/**
 * Observers are diagnostics, not control flow. A throwing observer must never
 * become the outage it was added to report — the whole point of this store is
 * that nothing inside it can break authentication.
 */
function invokeObserver(notify: () => void): void {
  try {
    notify();
  } catch {
    // Intentionally swallowed — see above.
  }
}

/**
 * Adapt the isolated rate-limit Redis client (#1186 — its own logical DB so a
 * queue backlog or cache-invalidation storm can't add latency to the hot auth
 * path) into the shared KV contract Better Auth's `customStorage` is built on.
 *
 * **Fails open by design.** The client is gated on `isReady` and every command
 * is wrapped, so a Redis outage degrades cross-instance rate limiting instead of
 * breaking authentication. A read that fails reads as "no window recorded yet",
 * which lets the request through rather than blocking it.
 *
 * **Failing open silently is the operational hazard.** Auth keeps returning 200
 * while cross-instance brute-force throttling stops enforcing, so the outage is
 * invisible until an attempt succeeds. Pass `onDegraded` / `onRecovered` to get
 * that signal to operators; both are throttled and exception-guarded so
 * observability can never cost the fail-open guarantee above.
 */
export function buildRedisRateLimitStore(
  client: IBetterAuthRateLimitRedisClient,
  {
    degradationSignalIntervalMs = DEFAULT_DEGRADATION_SIGNAL_INTERVAL_MS,
    onDegraded,
    onRecovered,
  }: IBuildRedisRateLimitStoreOptions = {},
): IBetterAuthRateLimitStore {
  /** When an event last reached `onDegraded`; `null` before the first one. */
  let lastSignalledAt: number | null = null;
  /** Degraded operations swallowed by the throttle since that event. */
  let suppressedCount = 0;
  /** Degraded operations across the current outage, for the recovery event. */
  let degradedCount = 0;

  function signalDegraded(
    operation: BetterAuthRateLimitOperation,
    reason: BetterAuthRateLimitDegradationReason,
    error?: unknown,
  ): void {
    degradedCount += 1;

    if (!onDegraded) {
      return;
    }

    const now = Date.now();
    const isThrottled =
      lastSignalledAt !== null &&
      now - lastSignalledAt < degradationSignalIntervalMs;
    if (isThrottled) {
      suppressedCount += 1;
      return;
    }

    const suppressedSinceLastSignal = suppressedCount;
    lastSignalledAt = now;
    suppressedCount = 0;
    invokeObserver(() =>
      onDegraded({
        operation,
        reason,
        suppressedCount: suppressedSinceLastSignal,
        ...(error !== undefined && { error }),
      }),
    );
  }

  function signalHealthy(operation: BetterAuthRateLimitOperation): void {
    if (degradedCount === 0) {
      return;
    }

    const outageSize = degradedCount;
    degradedCount = 0;
    suppressedCount = 0;
    // Cleared so the next outage signals immediately instead of waiting out a
    // throttle window opened by the previous one.
    lastSignalledAt = null;

    if (onRecovered) {
      invokeObserver(() =>
        onRecovered({ degradedCount: outageSize, operation }),
      );
    }
  }

  return {
    get: async (key) => {
      if (!client.isReady) {
        signalDegraded('get', 'client-unavailable');
        return null;
      }
      try {
        const value = (await client.instance.get(key)) ?? null;
        signalHealthy('get');
        return value;
      } catch (error) {
        signalDegraded('get', 'command-failed', error);
        return null;
      }
    },
    set: async (key, value, ttlSeconds) => {
      if (!client.isReady) {
        signalDegraded('set', 'client-unavailable');
        return;
      }
      try {
        await client.instance.set(key, value, 'EX', ttlSeconds);
        signalHealthy('set');
      } catch (error) {
        // Fail open: never let a Redis error break auth rate limiting.
        signalDegraded('set', 'command-failed', error);
      }
    },
  };
}
