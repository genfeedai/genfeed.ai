import { WorkloadRedisClientService } from '@api/common/services/workload-redis-client.service';
import { ConfigService } from '@api/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { RedisWorkload } from '@libs/redis/redis-connection.utils';
import { Injectable } from '@nestjs/common';

/**
 * ioredis client dedicated to Better Auth rate-limit counters (#1186).
 *
 * Previously the rate-limit store rode on the shared {@link CacheClientService},
 * so a cache-invalidation storm or queue backlog on that instance could add
 * latency to `ba:ratelimit:*` operations on the hot authentication path. This
 * client is isolated on its own logical DB (`REDIS_RATELIMIT_DB`, default 2) —
 * or a dedicated instance via `REDIS_RATELIMIT_URL` — so rate limiting has
 * predictable latency independent of the other workloads.
 *
 * Better Auth's deliberate fail-open behavior is unchanged: callers gate on
 * `isReady` and swallow errors, so if this client is unavailable, auth requests
 * are allowed through rather than blocked.
 */
@Injectable()
export class RateLimitClientService extends WorkloadRedisClientService {
  constructor(configService: ConfigService, logger: LoggerService) {
    super(configService, logger, RedisWorkload.RATE_LIMIT);
  }
}
