import type { IBetterAuthRateLimitRedisCommands } from './better-auth.types';
import { CONSUME_RATE_LIMIT_SCRIPT } from './better-auth-rate-limit.script';

export interface IFakeRateLimitRedis extends IBetterAuthRateLimitRedisCommands {
  readonly entries: Map<string, string>;
  readonly ttls: Map<string, number>;
}

/**
 * In-memory Redis stand-in that runs `CONSUME_RATE_LIMIT_SCRIPT`'s semantics in
 * one synchronous step, as Redis does for a script. Entries are stored as JSON
 * strings, so tests can seed foreign or malformed values.
 */
export function createFakeRateLimitRedis(): IFakeRateLimitRedis {
  const entries = new Map<string, string>();
  const ttls = new Map<string, number>();

  return {
    entries,
    eval: async (script, _numKeys, ...args) => {
      if (script !== CONSUME_RATE_LIMIT_SCRIPT) {
        throw new Error('Unsupported script');
      }
      const [key, now, windowMs, max, ttl, identity] = args as [
        string,
        number,
        number,
        number,
        number,
        string,
      ];
      const raw = entries.get(key);
      let count: number | null = null;
      let last = 0;
      if (raw !== undefined) {
        try {
          const parsed: unknown = JSON.parse(raw);
          const candidate = parsed as Record<string, unknown> | null;
          if (
            typeof candidate?.count === 'number' &&
            typeof candidate.lastRequest === 'number'
          ) {
            count = candidate.count;
            last = candidate.lastRequest;
          }
        } catch {
          count = null;
        }
      }
      if (count === null || now - last >= windowMs) {
        count = 0;
      } else if (count >= max) {
        return [0, Math.ceil((last + windowMs - now) / 1000)];
      }
      entries.set(
        key,
        JSON.stringify({ count: count + 1, key: identity, lastRequest: now }),
      );
      ttls.set(key, ttl);
      return [1, 0];
    },
    ttls,
  };
}
