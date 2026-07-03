/**
 * Shared Redis connection config utilities.
 * Single source of truth for TLS — derived from BOTH REDIS_TLS env var AND URL scheme.
 *
 * Single client stack — ioredis (also used by BullMQ under the hood):
 * - ioredis: tls = {} (empty object enables TLS)
 *
 * Workload isolation (#1186): the four independent Redis consumers — BullMQ
 * queues, HTTP response cache, Better Auth rate limiting, and the socket.io
 * fan-out adapter — resolve their connection through {@link RedisWorkload} so
 * load on one cannot contend for the same logical database / command throughput
 * as the others. Each workload defaults to a distinct logical database on the
 * base `REDIS_URL`, and can be pointed at a fully separate instance later via a
 * per-workload `REDIS_<WORKLOAD>_URL` override — no coordinated multi-service
 * deploy required, since every override falls back to the shared base config.
 */

/**
 * The four independent Redis consumers that must not contend for the same
 * connection/command throughput. `DEFAULT` is the shared application pub/sub bus
 * (integration events, websocket delivery) whose publisher/subscriber pairing is
 * matched across services — it stays on the base connection (logical DB 0).
 */
export enum RedisWorkload {
  CACHE = 'CACHE',
  DEFAULT = 'DEFAULT',
  QUEUE = 'QUEUE',
  RATE_LIMIT = 'RATELIMIT',
  SOCKET = 'SOCKET',
}

/**
 * Default logical database index per workload. Queues stay on DB 0 so in-flight
 * jobs are preserved and every queue-touching service (api/workers/files/clips)
 * agrees on the same namespace without coordination; the other workloads move to
 * dedicated indices so a spike or flush on one cannot evict/starve another.
 */
const WORKLOAD_DEFAULT_DB: Record<RedisWorkload, number> = {
  [RedisWorkload.DEFAULT]: 0,
  [RedisWorkload.QUEUE]: 0,
  [RedisWorkload.CACHE]: 1,
  [RedisWorkload.RATE_LIMIT]: 2,
  [RedisWorkload.SOCKET]: 3,
};

export interface ParsedRedisConfig {
  /**
   * Logical Redis database index. Omitted for the base/default connection so
   * ioredis uses its own default (DB 0); set explicitly for isolated workloads.
   */
  db?: number;
  host: string;
  password?: string;
  port: number;
  tls: boolean;
  url: string;
}

/** ioredis retryStrategy return type: ms delay to retry, or non-number to stop retrying. */
export type IoRedisRetryStrategy = (retries: number) => number | null;

export interface IoRedisConnectionOptions {
  connectTimeout?: number;
  /** Defaults to true — caller must invoke `.connect()` explicitly (matches prior node-redis usage). */
  lazyConnect?: boolean;
  retryStrategy?: IoRedisRetryStrategy;
}

/**
 * Parse Redis connection from config service.
 * TLS is enabled if EITHER:
 * - REDIS_TLS env var is true (boolean from Joi)
 * - REDIS_URL starts with rediss:// (TLS scheme)
 */
export function parseRedisConnection(configService: {
  get: (key: string) => string | boolean | number | undefined;
}): ParsedRedisConfig {
  const redisUrl =
    (configService.get('REDIS_URL') as string) || 'redis://localhost:6379';
  const redisTls = configService.get('REDIS_TLS');
  const redisPassword = configService.get('REDIS_PASSWORD') as
    | string
    | undefined;

  // TLS from env var (Joi boolean) OR URL scheme
  const tlsFromUrl = redisUrl.startsWith('rediss://');
  const tls = Boolean(redisTls) || tlsFromUrl;

  let host = 'localhost';
  let port = 6379;
  let password: string | undefined;

  try {
    const parsed = new URL(redisUrl);
    host = parsed.hostname || host;
    port = parsed.port ? Number(parsed.port) : port;
    password = parsed.password || redisPassword;
  } catch {
    const withoutScheme = redisUrl.replace(/^.*:\/\//, '') || 'localhost:6379';
    const [parsedHost, parsedPort] = withoutScheme.split(':');
    host = parsedHost || host;
    port = parsedPort ? Number(parsedPort) : port;
    password = redisPassword;
  }

  return {
    host,
    password: password || undefined,
    port,
    tls,
    url: redisUrl,
  };
}

/** Coerce a numeric config value; ignore absent/boolean/non-numeric values. */
function toOptionalNumber(
  value: string | boolean | number | undefined,
): number | undefined {
  if (
    value === undefined ||
    value === null ||
    value === '' ||
    typeof value === 'boolean'
  ) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Parse the Redis connection for a specific {@link RedisWorkload}, applying its
 * isolation boundary. Resolution order for the endpoint:
 * - `REDIS_<WORKLOAD>_URL` (e.g. `REDIS_QUEUE_URL`) if set — lets prod point a
 *   workload at a fully separate instance/cluster;
 * - otherwise the shared base `REDIS_URL`.
 *
 * The logical database index resolves from `REDIS_<WORKLOAD>_DB` if set,
 * otherwise the workload's default index ({@link WORKLOAD_DEFAULT_DB}). Password
 * and TLS fall back to the base config when the per-workload URL omits them, so
 * a single injected `REDIS_PASSWORD` secret still covers every workload.
 *
 * The `DEFAULT` workload is intentionally identical to {@link parseRedisConnection}
 * (base connection, DB 0, no explicit `db`) so the shared application pub/sub bus
 * stays exactly where matched publishers/subscribers already expect it.
 */
export function parseRedisConnectionForWorkload(
  configService: {
    get: (key: string) => string | boolean | number | undefined;
  },
  workload: RedisWorkload,
): ParsedRedisConfig {
  if (workload === RedisWorkload.DEFAULT) {
    return parseRedisConnection(configService);
  }

  const overrideUrl = configService.get(`REDIS_${workload}_URL`);
  const base = parseRedisConnection({
    get: (key) => {
      // Route REDIS_URL to the per-workload override when present; every other
      // key (REDIS_PASSWORD, REDIS_TLS) still falls back to the base config.
      if (key === 'REDIS_URL' && overrideUrl) {
        return overrideUrl;
      }
      return configService.get(key);
    },
  });

  const db =
    toOptionalNumber(configService.get(`REDIS_${workload}_DB`)) ??
    WORKLOAD_DEFAULT_DB[workload];

  return { ...base, db };
}

/**
 * Build ioredis client options (for pub/sub, cache, direct clients, etc.)
 * Keep REDIS_PASSWORD separate from REDIS_URL so production can inject the
 * password as an ECS secret without placing it in a plaintext env value.
 *
 * `lazyConnect` defaults to true so callers retain explicit control over when
 * the connection is established (matching the previous node-redis
 * `createClient()` + `.connect()` two-step lifecycle).
 */
export function buildIoRedisClientOptions(
  config: ParsedRedisConfig,
  options: IoRedisConnectionOptions = {},
) {
  return {
    connectTimeout: options.connectTimeout ?? 3_000,
    ...(config.db !== undefined && { db: config.db }),
    host: config.host,
    lazyConnect: options.lazyConnect ?? true,
    ...(config.password && { password: config.password }),
    port: config.port,
    ...(options.retryStrategy && { retryStrategy: options.retryStrategy }),
    ...(config.tls && { tls: {} }),
  };
}

/**
 * Build BullMQ/ioredis connection options (for queues).
 * BullMQ uses ioredis under the hood — TLS is `tls: {}`.
 */
export function buildBullMQConnection(config: ParsedRedisConfig) {
  return {
    host: config.host,
    port: config.port,
    ...(config.db !== undefined && { db: config.db }),
    ...(config.password && { password: config.password }),
    connectTimeout: 3_000,
    enableOfflineQueue: false,
    enableReadyCheck: false,
    lazyConnect: true,
    maxRetriesPerRequest: 0,
    retryStrategy: () => null,
    skipVersionCheck: true,
    ...(config.tls && { tls: {} }),
  };
}
