/**
 * Redis driver selection (#2382 — spike for the offline-desktop epic #2378).
 *
 * Cloud and community deployments run a real Redis and must stay on
 * {@link RedisDriver.REDIS} — it is the default, and nothing about their
 * behaviour changes. The desktop app embeds the API in a single Electron
 * process alongside an embedded Postgres, where there is no Redis to reach and
 * no second process to coordinate with; there, {@link RedisDriver.IN_PROCESS}
 * swaps the cross-process primitives for in-process equivalents.
 *
 * This is deliberately a property of the existing Redis configuration rather
 * than a parallel module: every consumer keeps the same injected token and the
 * same interface, so a driver switch is invisible above this layer.
 */
export enum RedisDriver {
  /** In-process substitutes. Single-process deployments only (desktop). */
  IN_PROCESS = 'in-process',
  /** Real Redis over the network. Default for cloud and community. */
  REDIS = 'redis',
}

/**
 * Resolve the configured driver, defaulting to {@link RedisDriver.REDIS}.
 *
 * Any unrecognised value falls back to the default rather than throwing: an
 * environment typo must not turn a cloud deployment into a single-process one,
 * because the failure would be silent data loss across replicas rather than a
 * boot error.
 */
export function resolveRedisDriver(configService: {
  get: (key: string) => string | boolean | number | undefined;
}): RedisDriver {
  const configured = configService.get('REDIS_DRIVER');
  return configured === RedisDriver.IN_PROCESS
    ? RedisDriver.IN_PROCESS
    : RedisDriver.REDIS;
}

/** True when the process must not attempt any network Redis connection. */
export function isInProcessRedis(configService: {
  get: (key: string) => string | boolean | number | undefined;
}): boolean {
  return resolveRedisDriver(configService) === RedisDriver.IN_PROCESS;
}
