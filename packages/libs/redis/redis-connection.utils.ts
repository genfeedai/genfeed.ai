/**
 * Shared Redis connection config utilities.
 * Single source of truth for TLS — derived from BOTH REDIS_TLS env var AND URL scheme.
 *
 * Single client stack — ioredis (also used by BullMQ under the hood):
 * - ioredis: tls = {} (empty object enables TLS)
 */

export interface ParsedRedisConfig {
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
