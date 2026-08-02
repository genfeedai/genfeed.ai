/**
 * Redis-backed rate-limit store for Better Auth (#1186, #738 criteria 6-7).
 *
 * Extracted from `BetterAuthModule` so the fail-open behavior the PRD requires
 * is exercised by tests against the real adapter rather than a hand-written
 * lookalike.
 */
import type {
  BetterAuthRateLimitDegradationReason,
  BetterAuthRateLimitOperation,
  IBetterAuthRateLimitRedisClient,
  IBetterAuthRateLimitStore,
  IBuildRedisRateLimitStoreOptions,
} from './better-auth.types';

/** One signal per minute is enough to alert on, cheap enough to never flood. */
const DEFAULT_DEGRADATION_SIGNAL_INTERVAL_MS = 60_000;

/**
 * Floor on how soon a fresh outage may signal after a recovery.
 *
 * Recovery re-arms the throttle so a genuinely new outage is not silenced by a
 * window the previous one opened. Re-arming outright, though, hands a flapping
 * client an unthrottled channel: alternating success/failure clears the window
 * on every success, so every failure signals — one line per operation on the
 * hot auth path, which is precisely the flood the throttle exists to prevent.
 * The floor bounds that worst case to one signal per interval below.
 */
const DEFAULT_RECOVERY_REARM_FLOOR_MS = 5_000;

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
    recoveryRearmFloorMs = DEFAULT_RECOVERY_REARM_FLOOR_MS,
  }: IBuildRedisRateLimitStoreOptions = {},
): IBetterAuthRateLimitStore {
  // A floor longer than the window itself would extend the throttle on recovery
  // rather than shorten it, inverting the option's meaning.
  const rearmFloorMs = Math.min(
    recoveryRearmFloorMs,
    degradationSignalIntervalMs,
  );

  /** When an event last reached `onDegraded`; `null` before the first one. */
  let lastSignalledAt: number | null = null;
  /** Degraded operations swallowed by the throttle since that event. */
  let suppressedCount = 0;
  /** Degraded operations across the current outage, for the recovery event. */
  let degradedCount = 0;
  /**
   * Whether the current outage ever reached `onDegraded`. Recovery is only
   * worth reporting if the degradation was — otherwise a flapping client emits
   * a stream of "recovered" lines for outages nothing ever announced.
   */
  let hasReportedDegradation = false;

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
    hasReportedDegradation = true;
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
    const wasReported = hasReportedDegradation;
    degradedCount = 0;
    suppressedCount = 0;
    hasReportedDegradation = false;
    // Wound back so the throttle expires `rearmFloorMs` from now: a genuinely
    // new outage signals promptly instead of waiting out a window the previous
    // one opened, while a flapping client — which recovers between every
    // failure — still cannot signal more than once per floor.
    lastSignalledAt = Date.now() - degradationSignalIntervalMs + rearmFloorMs;

    // Nothing announced this outage, so there is nothing to announce the end of.
    // Without this a flapping client emits a "recovered" line per successful
    // operation while every matching degradation is being throttled away.
    if (onRecovered && wasReported) {
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
