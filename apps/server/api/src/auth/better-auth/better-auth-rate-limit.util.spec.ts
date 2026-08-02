/**
 * Observability of the deliberate fail-open (#738 criterion 7).
 *
 * The fail-open itself is required and is covered end-to-end against the real
 * Better Auth handler in `better-auth-rate-limit.integration.spec.ts`. What this
 * suite guards is the half that has no user-visible symptom: while the store is
 * failing open, `/auth/*` keeps answering 200 with cross-instance brute-force
 * throttling switched off, and before the observer hooks existed no signal
 * reached operators at all. Every assertion here therefore pairs "the signal
 * fired" with "the store still failed open" — an observer must never be able to
 * turn a Redis outage into an auth outage.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  IBetterAuthRateLimitDegradedEvent,
  IBetterAuthRateLimitRecoveredEvent,
  IBetterAuthRateLimitRedisClient,
  IBetterAuthRateLimitRedisCommands,
} from './better-auth.types';
import { buildRedisRateLimitStore } from './better-auth-rate-limit.util';

const KEY = 'ba:ratelimit:203.0.113.10|/sign-in/email';
const VALUE = '{"count":1,"lastRequest":1}';
const TTL_SECONDS = 60;
const SIGNAL_INTERVAL_MS = 60_000;
const REARM_FLOOR_MS = 5_000;

/** A client whose commands always reject, as ioredis does when Redis is down. */
function createThrowingClient(
  error: Error = new Error('ECONNREFUSED'),
): IBetterAuthRateLimitRedisClient {
  return {
    instance: {
      get: async () => {
        throw error;
      },
      set: async () => {
        throw error;
      },
    },
    isReady: true,
  };
}

/**
 * The steady-state outage shape: the connection is down, so the store short-
 * circuits on `isReady` and never issues a command. Touching `instance` here is
 * a test failure, not a runtime path.
 */
function createUnavailableClient(): IBetterAuthRateLimitRedisClient {
  return {
    get instance(): never {
      throw new Error('Redis client accessed while not ready');
    },
    isReady: false,
  };
}

/**
 * Structurally an {@link IBetterAuthRateLimitRedisClient}, minus the `readonly`
 * on `isReady`, so a test can take the connection down and bring it back.
 */
interface IMutableRateLimitRedisClient {
  instance: IBetterAuthRateLimitRedisCommands;
  isReady: boolean;
}

/** A healthy client backed by an in-memory map, with a flippable ready flag. */
function createRecoverableClient(): IMutableRateLimitRedisClient {
  const entries = new Map<string, string>();
  const instance: IBetterAuthRateLimitRedisCommands = {
    get: async (key) => entries.get(key) ?? null,
    set: async (key, value) => {
      entries.set(key, value);
      return 'OK';
    },
  };
  return { instance, isReady: true };
}

describe('buildRedisRateLimitStore observability', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports a thrown `get` while still failing open with null', async () => {
    const onDegraded =
      vi.fn<(event: IBetterAuthRateLimitDegradedEvent) => void>();
    const redisError = new Error('ECONNREFUSED');
    const store = buildRedisRateLimitStore(createThrowingClient(redisError), {
      onDegraded,
    });

    await expect(store.get(KEY)).resolves.toBeNull();

    expect(onDegraded).toHaveBeenCalledTimes(1);
    expect(onDegraded).toHaveBeenCalledWith({
      error: redisError,
      operation: 'get',
      reason: 'command-failed',
      suppressedCount: 0,
    });
  });

  it('reports a thrown `set` while still failing open without rejecting', async () => {
    const onDegraded =
      vi.fn<(event: IBetterAuthRateLimitDegradedEvent) => void>();
    const redisError = new Error('ECONNREFUSED');
    const store = buildRedisRateLimitStore(createThrowingClient(redisError), {
      onDegraded,
    });

    await expect(store.set(KEY, VALUE, TTL_SECONDS)).resolves.toBeUndefined();

    expect(onDegraded).toHaveBeenCalledTimes(1);
    expect(onDegraded).toHaveBeenCalledWith({
      error: redisError,
      operation: 'set',
      reason: 'command-failed',
      suppressedCount: 0,
    });
  });

  it('reports the `isReady === false` path, which issues no command at all', async () => {
    // The most likely steady-state outage shape, and the one that used to return
    // silently: no command is issued, so there is no error to catch and nothing
    // downstream would ever notice.
    const onDegraded =
      vi.fn<(event: IBetterAuthRateLimitDegradedEvent) => void>();
    const store = buildRedisRateLimitStore(createUnavailableClient(), {
      onDegraded,
    });

    await expect(store.get(KEY)).resolves.toBeNull();

    expect(onDegraded).toHaveBeenCalledTimes(1);
    expect(onDegraded).toHaveBeenCalledWith({
      operation: 'get',
      reason: 'client-unavailable',
      suppressedCount: 0,
    });
    // `client-unavailable` carries no thrown value — the field must be absent
    // rather than an `undefined` that reads as a lost error in the log line.
    expect(onDegraded.mock.calls[0]?.[0]).not.toHaveProperty('error');
  });

  it('collapses a sustained outage into one signal per window, counting what it suppressed', async () => {
    // Without this, a Redis outage emits one log line per auth request on the
    // hot path — the flood would bury the signal it exists to raise.
    const onDegraded =
      vi.fn<(event: IBetterAuthRateLimitDegradedEvent) => void>();
    const store = buildRedisRateLimitStore(createUnavailableClient(), {
      degradationSignalIntervalMs: SIGNAL_INTERVAL_MS,
      onDegraded,
    });

    await store.get(KEY);
    for (let request = 0; request < 5; request += 1) {
      await store.get(KEY);
      await store.set(KEY, VALUE, TTL_SECONDS);
    }

    expect(onDegraded).toHaveBeenCalledTimes(1);
    expect(onDegraded.mock.calls[0]?.[0].suppressedCount).toBe(0);

    vi.advanceTimersByTime(SIGNAL_INTERVAL_MS);
    await store.get(KEY);

    expect(onDegraded).toHaveBeenCalledTimes(2);
    // The 10 operations swallowed inside the closed window are accounted for,
    // so the second line reports outage volume rather than pretending it is the
    // second failure.
    expect(onDegraded.mock.calls[1]?.[0].suppressedCount).toBe(10);
  });

  it('signals recovery once, sized by the outage, and re-arms after the floor', async () => {
    const onDegraded =
      vi.fn<(event: IBetterAuthRateLimitDegradedEvent) => void>();
    const onRecovered =
      vi.fn<(event: IBetterAuthRateLimitRecoveredEvent) => void>();
    const client = createRecoverableClient();
    const store = buildRedisRateLimitStore(client, {
      degradationSignalIntervalMs: SIGNAL_INTERVAL_MS,
      onDegraded,
      onRecovered,
      recoveryRearmFloorMs: REARM_FLOOR_MS,
    });

    client.isReady = false;
    await store.get(KEY);
    await store.set(KEY, VALUE, TTL_SECONDS);
    client.isReady = true;
    await store.set(KEY, VALUE, TTL_SECONDS);

    expect(onRecovered).toHaveBeenCalledTimes(1);
    expect(onRecovered).toHaveBeenCalledWith({
      degradedCount: 2,
      operation: 'set',
    });

    // A healthy run must stay quiet…
    await store.get(KEY);
    expect(onRecovered).toHaveBeenCalledTimes(1);

    // …a fresh outage inside the re-arm floor is still throttled, which is what
    // stops recovery from handing a flapping client an unthrottled channel…
    client.isReady = false;
    await store.get(KEY);
    expect(onDegraded).toHaveBeenCalledTimes(1);

    // …and past the floor it signals, far sooner than the full window the first
    // outage opened, so a genuinely new outage is not silenced by the old one.
    vi.advanceTimersByTime(REARM_FLOOR_MS);
    await store.get(KEY);

    expect(onDegraded).toHaveBeenCalledTimes(2);
    expect(onDegraded.mock.calls[1]?.[0]).toEqual({
      operation: 'get',
      reason: 'client-unavailable',
      suppressedCount: 1,
    });
  });

  it('cannot be flooded by a client that flaps between failure and success', async () => {
    // The throttle keys off the last emitted signal, so clearing it on recovery
    // made alternating failure/success emit one line per failed operation — on
    // the hot auth path, and precisely the flood the throttle exists to prevent.
    const onDegraded =
      vi.fn<(event: IBetterAuthRateLimitDegradedEvent) => void>();
    const onRecovered =
      vi.fn<(event: IBetterAuthRateLimitRecoveredEvent) => void>();
    const client = createRecoverableClient();
    const store = buildRedisRateLimitStore(client, {
      degradationSignalIntervalMs: SIGNAL_INTERVAL_MS,
      onDegraded,
      onRecovered,
      recoveryRearmFloorMs: REARM_FLOOR_MS,
    });

    for (let request = 0; request < 20; request += 1) {
      client.isReady = false;
      await store.get(KEY);
      client.isReady = true;
      await store.get(KEY);
    }

    expect(onDegraded).toHaveBeenCalledTimes(1);
    // Recovery is only announced for an outage that was itself announced, so
    // the throttled degradations do not each earn a matching "recovered" line.
    expect(onRecovered).toHaveBeenCalledTimes(1);

    // Throttling the signal must not have touched the data path.
    await store.set(KEY, VALUE, TTL_SECONDS);
    await expect(store.get(KEY)).resolves.toBe(VALUE);
  });

  it('clamps a re-arm floor longer than the window itself', async () => {
    // A floor above the interval would push `lastSignalledAt` into the future,
    // extending the throttle on recovery instead of shortening it.
    const onDegraded =
      vi.fn<(event: IBetterAuthRateLimitDegradedEvent) => void>();
    const client = createRecoverableClient();
    const store = buildRedisRateLimitStore(client, {
      degradationSignalIntervalMs: SIGNAL_INTERVAL_MS,
      onDegraded,
      recoveryRearmFloorMs: SIGNAL_INTERVAL_MS * 10,
    });

    client.isReady = false;
    await store.get(KEY);
    client.isReady = true;
    await store.get(KEY);

    client.isReady = false;
    await store.get(KEY);
    expect(onDegraded).toHaveBeenCalledTimes(1);

    // Clamped, so the wait after recovery is one whole window at worst. Left
    // unclamped this floor would have pushed the next signal ten windows out —
    // the option would delay the very signal it exists to hurry along.
    vi.advanceTimersByTime(SIGNAL_INTERVAL_MS);
    await store.get(KEY);

    expect(onDegraded).toHaveBeenCalledTimes(2);
  });

  it('stays quiet and returns the stored value while Redis is healthy', async () => {
    const onDegraded =
      vi.fn<(event: IBetterAuthRateLimitDegradedEvent) => void>();
    const onRecovered =
      vi.fn<(event: IBetterAuthRateLimitRecoveredEvent) => void>();
    const store = buildRedisRateLimitStore(createRecoverableClient(), {
      onDegraded,
      onRecovered,
    });

    await store.set(KEY, VALUE, TTL_SECONDS);

    await expect(store.get(KEY)).resolves.toBe(VALUE);
    await expect(store.get('ba:ratelimit:unseen')).resolves.toBeNull();
    expect(onDegraded).not.toHaveBeenCalled();
    expect(onRecovered).not.toHaveBeenCalled();
  });

  it('keeps failing open when the observer itself throws', async () => {
    // The observability hook must not become the outage it was added to report:
    // a broken logger sink would otherwise escape as a 500 on sign-in.
    const onDegraded = vi.fn(() => {
      throw new Error('log transport unavailable');
    });
    const onRecovered = vi.fn(() => {
      throw new Error('log transport unavailable');
    });
    const client = createRecoverableClient();
    const store = buildRedisRateLimitStore(client, { onDegraded, onRecovered });

    client.isReady = false;
    await expect(store.get(KEY)).resolves.toBeNull();
    await expect(store.set(KEY, VALUE, TTL_SECONDS)).resolves.toBeUndefined();

    client.isReady = true;
    await expect(store.set(KEY, VALUE, TTL_SECONDS)).resolves.toBeUndefined();

    expect(onDegraded).toHaveBeenCalled();
    expect(onRecovered).toHaveBeenCalled();
  });

  it('fails open with no observers wired, exactly as before', async () => {
    const store = buildRedisRateLimitStore(createThrowingClient());

    await expect(store.get(KEY)).resolves.toBeNull();
    await expect(store.set(KEY, VALUE, TTL_SECONDS)).resolves.toBeUndefined();
  });
});
