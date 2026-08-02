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

/**
 * Adapt the isolated rate-limit Redis client (#1186 — its own logical DB so a
 * queue backlog or cache-invalidation storm can't add latency to the hot auth
 * path) into the shared KV contract Better Auth's `customStorage` is built on.
 *
 * **Fails open by design.** The client is gated on `isReady` and every command
 * is wrapped, so a Redis outage degrades cross-instance rate limiting instead of
 * breaking authentication. A read that fails reads as "no window recorded yet",
 * which lets the request through rather than blocking it.
 */
export function buildRedisRateLimitStore(
  client: IBetterAuthRateLimitRedisClient,
): IBetterAuthRateLimitStore {
  return {
    get: async (key) => {
      if (!client.isReady) {
        return null;
      }
      try {
        return (await client.instance.get(key)) ?? null;
      } catch {
        return null;
      }
    },
    set: async (key, value, ttlSeconds) => {
      if (!client.isReady) {
        return;
      }
      try {
        await client.instance.set(key, value, 'EX', ttlSeconds);
      } catch {
        // Fail open: never let a Redis error break auth rate limiting.
        return;
      }
    },
  };
}
