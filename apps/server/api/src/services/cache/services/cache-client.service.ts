import { WorkloadRedisClientService } from '@api/common/services/workload-redis-client.service';
import { ConfigService } from '@api/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { RedisWorkload } from '@libs/redis/redis-connection.utils';
import { Injectable } from '@nestjs/common';

/**
 * ioredis client dedicated to the HTTP response cache workload (#1186).
 *
 * Isolated on its own logical DB (`REDIS_CACHE_DB`, default 1) — or a dedicated
 * instance via `REDIS_CACHE_URL` — so a cache tag-invalidation storm (SCAN +
 * UNLINK fan-out) cannot contend with queue, auth rate-limit, or socket.io
 * throughput. Lifecycle and reconnect behavior live in the shared base.
 */
@Injectable()
export class CacheClientService extends WorkloadRedisClientService {
  constructor(configService: ConfigService, logger: LoggerService) {
    super(configService, logger, RedisWorkload.CACHE);
  }
}
