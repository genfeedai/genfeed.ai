/**
 * Auth brute-force throttling contract — acceptance criteria 6 and 7 of #738.
 *
 * These two criteria are explicitly "verified by an automated integration test
 * rather than a manual probe", so this suite drives the real Better Auth
 * request handler (`auth.handler`) through the same option builders the
 * production factory uses — `buildBetterAuthAdvancedOptions` for client-IP
 * resolution and `buildRateLimitStorage` over the shared Redis KV — and
 * asserts on real HTTP responses, never on a mock's own return value.
 *
 * Why this is worth an integration test rather than a config assertion: the
 * NestJS `RateLimitGuard` does NOT cover `/auth/*` (Better Auth mounts as a raw
 * Express handler via `toNodeHandler`, `better-auth.service.ts`), so throttling
 * is owned entirely by Better Auth's built-in mechanism. Passing
 * `rateLimit: { enabled: true }` silently activates built-in per-path rules that
 * override the global 100/10s bucket — `/sign-in/*` is capped at **3 requests
 * per 10 seconds** (`better-auth/dist/api/rate-limiter`, `getDefaultSpecialRules`).
 * At that cap, correct per-IP keying is load-bearing: if client-IP resolution
 * collapses every caller onto one address, the platform-wide sign-in ceiling
 * becomes 3 requests per 10 seconds for all users at once. Criterion 6 is
 * therefore asserted as *isolation*, not merely as "a 429 eventually appears".
 */

import { betterAuth } from 'better-auth';
import { type MemoryDB, memoryAdapter } from 'better-auth/adapters/memory';
import { describe, expect, it } from 'vitest';
import { parseCommaSeparated } from './better-auth.config';
import { BETTER_AUTH_BASE_PATH } from './better-auth.constants';
import {
  buildBetterAuthAdvancedOptions,
  buildRateLimitStorage,
} from './better-auth.factory';
import type {
  IBetterAuthRateLimitRedisClient,
  IBetterAuthRateLimitStore,
} from './better-auth.types';
import { buildRedisRateLimitStore } from './better-auth-rate-limit.util';

const AUTH_BASE_URL = 'http://localhost:3000';
const AUTH_SECRET =
  'better-auth-rate-limit-integration-secret-with-sufficient-entropy';
const SIGN_IN_PATH = '/sign-in/email';
const SIGN_UP_PATH = '/sign-up/email';
/** Better Auth's built-in special rule for `/sign-in/*`: 3 requests / 10 s. */
const SIGN_IN_MAX_REQUESTS = 3;
/** Namespace applied by {@link buildRateLimitStorage} before hitting Redis. */
const RATE_LIMIT_KEY_PREFIX = 'ba:ratelimit:';
const FORWARDED_FOR_HEADER = 'x-forwarded-for';
const NOISY_CLIENT_IP = '203.0.113.10';
const BYSTANDER_CLIENT_IP = '198.51.100.25';
const KNOWN_PASSWORD = 'correct-horse-battery-staple';
const WRONG_PASSWORD = 'definitely-not-the-password';
const HTTP_TOO_MANY_REQUESTS = 429;
const HTTP_SERVER_ERROR_FLOOR = 500;

interface IRecordingRateLimitStore extends IBetterAuthRateLimitStore {
  readonly entries: Map<string, string>;
}

interface ICreateRateLimitHarnessOptions {
  /** Shared across instances to model two API tasks on one Postgres. */
  database?: MemoryDB;
  ipAddressHeaders?: string[];
  store: IBetterAuthRateLimitStore;
}

interface IAuthRequestOptions {
  body: Record<string, string>;
  clientIp: string;
  headerName?: string;
}

interface ISignInAttemptOptions {
  clientIp: string;
  email?: string;
  headerName?: string;
  password?: string;
}

/** In-memory stand-in for the Redis KV behind the rate-limit counters. */
function createRecordingRateLimitStore(): IRecordingRateLimitStore {
  const entries = new Map<string, string>();
  return {
    entries,
    get: async (key) => entries.get(key) ?? null,
    set: async (key, value) => {
      entries.set(key, value);
    },
  };
}

function createEmptyMemoryDatabase(): MemoryDB {
  return { account: [], session: [], user: [], verification: [] };
}

/**
 * A Better Auth instance wired exactly like production: the same base path, the
 * same `advanced.ipAddress` builder, and the same shared-storage adapter.
 */
function createRateLimitHarness({
  database = createEmptyMemoryDatabase(),
  ipAddressHeaders = [FORWARDED_FOR_HEADER],
  store,
}: ICreateRateLimitHarnessOptions) {
  const auth = betterAuth({
    advanced: buildBetterAuthAdvancedOptions({ ipAddressHeaders }),
    basePath: BETTER_AUTH_BASE_PATH,
    baseURL: AUTH_BASE_URL,
    database: memoryAdapter(database),
    emailAndPassword: { enabled: true },
    rateLimit: {
      customStorage: buildRateLimitStorage(store),
      enabled: true,
    },
    secret: AUTH_SECRET,
  });

  return {
    database,
    request(
      path: string,
      {
        body,
        clientIp,
        headerName = FORWARDED_FOR_HEADER,
      }: IAuthRequestOptions,
    ): Promise<Response> {
      return auth.handler(
        new Request(`${AUTH_BASE_URL}${BETTER_AUTH_BASE_PATH}${path}`, {
          body: JSON.stringify(body),
          headers: {
            'content-type': 'application/json',
            [headerName]: clientIp,
          },
          method: 'POST',
        }),
      );
    },
  };
}

type RateLimitHarness = ReturnType<typeof createRateLimitHarness>;

function attemptSignIn(
  harness: RateLimitHarness,
  {
    clientIp,
    email = 'rate-limit-target@example.com',
    headerName = FORWARDED_FOR_HEADER,
    password = WRONG_PASSWORD,
  }: ISignInAttemptOptions,
): Promise<Response> {
  return harness.request(SIGN_IN_PATH, {
    body: { email, password },
    clientIp,
    headerName,
  });
}

/** Drive the `/sign-in/*` bucket to exhaustion and return every response. */
async function exhaustSignInBudget(
  harness: RateLimitHarness,
  clientIp: string,
): Promise<Response[]> {
  const responses: Response[] = [];
  for (let attempt = 0; attempt <= SIGN_IN_MAX_REQUESTS; attempt += 1) {
    responses.push(await attemptSignIn(harness, { clientIp }));
  }
  return responses;
}

function getRateLimitKeys(store: IRecordingRateLimitStore): string[] {
  return [...store.entries.keys()];
}

describe('Better Auth `/auth/*` brute-force throttling (criterion 6)', () => {
  it('starts returning 429 once repeated failed sign-ins from one client IP exceed the built-in cap', async () => {
    const store = createRecordingRateLimitStore();
    const harness = createRateLimitHarness({ store });

    const responses = await exhaustSignInBudget(harness, NOISY_CLIENT_IP);
    const allowed = responses.slice(0, SIGN_IN_MAX_REQUESTS);
    const throttled = responses[SIGN_IN_MAX_REQUESTS];

    expect(allowed).toHaveLength(SIGN_IN_MAX_REQUESTS);
    for (const response of allowed) {
      expect(response.status).not.toBe(HTTP_TOO_MANY_REQUESTS);
      expect(response.status).toBeLessThan(HTTP_SERVER_ERROR_FLOOR);
    }
    expect(throttled.status).toBe(HTTP_TOO_MANY_REQUESTS);
    expect(throttled.headers.get('X-Retry-After')).not.toBeNull();
  });

  it('isolates counters per client IP so one address cannot exhaust the platform-wide sign-in budget', async () => {
    const store = createRecordingRateLimitStore();
    const harness = createRateLimitHarness({ store });

    const noisy = await exhaustSignInBudget(harness, NOISY_CLIENT_IP);
    const bystander = await attemptSignIn(harness, {
      clientIp: BYSTANDER_CLIENT_IP,
    });

    // The regression this guards: if IP resolution is misconfigured behind the
    // load balancer and every request resolves to the same proxy address, the
    // 3-per-10s `/sign-in/*` cap becomes a platform-wide ceiling and this
    // bystander — a different user, first attempt — is thrown a 429.
    expect(noisy[SIGN_IN_MAX_REQUESTS].status).toBe(HTTP_TOO_MANY_REQUESTS);
    expect(bystander.status).not.toBe(HTTP_TOO_MANY_REQUESTS);
    expect(bystander.status).toBeLessThan(HTTP_SERVER_ERROR_FLOOR);
    expect(getRateLimitKeys(store)).toEqual(
      expect.arrayContaining([
        `${RATE_LIMIT_KEY_PREFIX}${NOISY_CLIENT_IP}|${SIGN_IN_PATH}`,
        `${RATE_LIMIT_KEY_PREFIX}${BYSTANDER_CLIENT_IP}|${SIGN_IN_PATH}`,
      ]),
    );
  });

  it('resolves the client IP through the configured BETTER_AUTH_IP_HEADERS header rather than the socket address', async () => {
    const store = createRecordingRateLimitStore();
    const harness = createRateLimitHarness({
      ipAddressHeaders: parseCommaSeparated(
        'cf-connecting-ip, x-forwarded-for',
      ),
      store,
    });

    await attemptSignIn(harness, {
      clientIp: NOISY_CLIENT_IP,
      headerName: 'cf-connecting-ip',
    });
    await attemptSignIn(harness, {
      clientIp: BYSTANDER_CLIENT_IP,
      headerName: 'cf-connecting-ip',
    });

    expect(getRateLimitKeys(store)).toEqual([
      `${RATE_LIMIT_KEY_PREFIX}${NOISY_CLIENT_IP}|${SIGN_IN_PATH}`,
      `${RATE_LIMIT_KEY_PREFIX}${BYSTANDER_CLIENT_IP}|${SIGN_IN_PATH}`,
    ]);
  });

  it('applies one counter across horizontally-scaled instances sharing the injected storage', async () => {
    const store = createRecordingRateLimitStore();
    const database = createEmptyMemoryDatabase();
    const instanceA = createRateLimitHarness({ database, store });
    const instanceB = createRateLimitHarness({ database, store });

    // Exhaust the budget entirely on instance A…
    const onInstanceA = await exhaustSignInBudget(instanceA, NOISY_CLIENT_IP);
    // …then hit instance B, which has never seen this IP in its own process.
    const onInstanceB = await attemptSignIn(instanceB, {
      clientIp: NOISY_CLIENT_IP,
    });

    expect(onInstanceA[SIGN_IN_MAX_REQUESTS].status).toBe(
      HTTP_TOO_MANY_REQUESTS,
    );
    expect(onInstanceB.status).toBe(HTTP_TOO_MANY_REQUESTS);
  });

  it('collapses to a single shared bucket when the forwarded chain has more than one hop', async () => {
    // Documented deployment constraint, not a defect of this suite: without
    // `advanced.ipAddress.trustedProxies` Better Auth refuses to trust a
    // multi-hop `x-forwarded-for` (the leftmost entry is spoofable) and keys
    // every caller into one bucket. Today's topology is browser → ALB → Fargate,
    // a single hop, so this does not bite. Putting a CDN or an app-origin proxy
    // in front of `api.genfeed.ai` would silently collapse per-IP throttling —
    // this test fails loudly if that assumption ever changes.
    const store = createRecordingRateLimitStore();
    const harness = createRateLimitHarness({ store });

    await attemptSignIn(harness, {
      clientIp: `${NOISY_CLIENT_IP}, 192.0.2.200`,
    });

    const keys = getRateLimitKeys(store);
    expect(keys).toHaveLength(1);
    expect(keys[0]).not.toContain(NOISY_CLIENT_IP);
  });
});

describe('Better Auth rate-limit fail-open under a Redis outage (criterion 7)', () => {
  it('keeps authenticating when the rate-limit store is unreachable', async () => {
    const outageClient: IBetterAuthRateLimitRedisClient = {
      get isReady() {
        return false;
      },
      get instance(): never {
        throw new Error('Redis client accessed while not ready');
      },
    };
    const harness = createRateLimitHarness({
      store: buildRedisRateLimitStore(outageClient),
    });

    const signUp = await harness.request(SIGN_UP_PATH, {
      body: {
        email: 'fail-open@example.com',
        name: 'Fail Open',
        password: KNOWN_PASSWORD,
      },
      clientIp: NOISY_CLIENT_IP,
    });
    const signIns: Response[] = [];
    for (let attempt = 0; attempt <= SIGN_IN_MAX_REQUESTS; attempt += 1) {
      signIns.push(
        await attemptSignIn(harness, {
          clientIp: NOISY_CLIENT_IP,
          email: 'fail-open@example.com',
          password: KNOWN_PASSWORD,
        }),
      );
    }

    expect(signUp.status).toBeLessThan(HTTP_SERVER_ERROR_FLOOR);
    for (const response of signIns) {
      expect(response.status).toBe(200);
    }
  });

  it('keeps authenticating when every Redis command throws', async () => {
    const throwingClient: IBetterAuthRateLimitRedisClient = {
      instance: {
        get: async () => {
          throw new Error('ECONNREFUSED');
        },
        set: async () => {
          throw new Error('ECONNREFUSED');
        },
      },
      isReady: true,
    };
    const harness = createRateLimitHarness({
      store: buildRedisRateLimitStore(throwingClient),
    });

    await harness.request(SIGN_UP_PATH, {
      body: {
        email: 'redis-down@example.com',
        name: 'Redis Down',
        password: KNOWN_PASSWORD,
      },
      clientIp: NOISY_CLIENT_IP,
    });
    const signIns: Response[] = [];
    for (let attempt = 0; attempt <= SIGN_IN_MAX_REQUESTS; attempt += 1) {
      signIns.push(
        await attemptSignIn(harness, {
          clientIp: NOISY_CLIENT_IP,
          email: 'redis-down@example.com',
          password: KNOWN_PASSWORD,
        }),
      );
    }

    for (const response of signIns) {
      expect(response.status).toBe(200);
    }
  });

  it('never surfaces a 5xx or a 429 when the storage adapter itself throws', async () => {
    // Defense in depth for a store that is not the module's fail-open adapter
    // (a future caller, or a bug in the adapter): the storage Better Auth calls
    // must swallow the failure rather than let it escape as a 500 on sign-in.
    const explodingStore: IBetterAuthRateLimitStore = {
      get: async () => {
        throw new Error('rate-limit store unavailable');
      },
      set: async () => {
        throw new Error('rate-limit store unavailable');
      },
    };
    const harness = createRateLimitHarness({ store: explodingStore });

    const responses = await exhaustSignInBudget(harness, NOISY_CLIENT_IP);

    for (const response of responses) {
      expect(response.status).not.toBe(HTTP_TOO_MANY_REQUESTS);
      expect(response.status).toBeLessThan(HTTP_SERVER_ERROR_FLOOR);
    }
  });

  it('does not lock an IP out permanently when a foreign value poisons its counter key', async () => {
    // The Redis instance is shared, so a foreign writer can leave parseable JSON
    // that is not a `RateLimit`. Better Auth's `decideConsume` then evaluates
    // `now - undefined > windowMs` — NaN, always false — so the window-expiry
    // reset branch can never fire, while `count >= max` stays true. That is a
    // 429 with no escape hatch, persisted for the key's full 24h TTL: a
    // permanent sign-in lockout for that IP. Fail open on the shape, not just
    // on `JSON.parse`.
    const store = createRecordingRateLimitStore();
    store.entries.set(
      `${RATE_LIMIT_KEY_PREFIX}${NOISY_CLIENT_IP}|${SIGN_IN_PATH}`,
      JSON.stringify({ count: 9_999, unrelatedField: 'from another app' }),
    );
    const harness = createRateLimitHarness({ store });

    const response = await attemptSignIn(harness, {
      clientIp: NOISY_CLIENT_IP,
    });

    expect(response.status).not.toBe(HTTP_TOO_MANY_REQUESTS);
    expect(response.status).toBeLessThan(HTTP_SERVER_ERROR_FLOOR);
  });

  it('still throttles normally after the poisoned counter key is discarded', async () => {
    // Failing open on a malformed value must not disable throttling for that
    // key — the next window is rebuilt from scratch and enforces as usual.
    const store = createRecordingRateLimitStore();
    store.entries.set(
      `${RATE_LIMIT_KEY_PREFIX}${NOISY_CLIENT_IP}|${SIGN_IN_PATH}`,
      JSON.stringify({ count: 'not-a-number', lastRequest: 'not-a-number' }),
    );
    const harness = createRateLimitHarness({ store });

    const responses = await exhaustSignInBudget(harness, NOISY_CLIENT_IP);

    expect(responses.at(-1)?.status).toBe(HTTP_TOO_MANY_REQUESTS);
  });
});
