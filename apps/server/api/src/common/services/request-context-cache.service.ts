import {
  buildRcKeysSetKey,
  RC_PREFIX,
} from '@api/common/constants/request-context-cache.constants';
import {
  collectRedisKeysByPattern,
  invalidateRedisSnapshot,
} from '@api/common/services/redis-cache-snapshot.helper';
import { LoggerService } from '@libs/logger/logger.service';
import { RedisService } from '@libs/redis/redis.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class RequestContextCacheService {
  private readonly context = { service: RequestContextCacheService.name };

  constructor(
    private readonly redisService: RedisService,
    private readonly logger: LoggerService,
  ) {}

  /**
   * Invalidate all cached contexts for a given Clerk user ID.
   * Reads the set of cached keys, unlinks them, then removes the set.
   */
  async invalidateForUser(clerkId: string): Promise<void> {
    const publisher = this.redisService.getPublisher();
    if (!publisher) {
      return;
    }

    try {
      const keysSetKey = buildRcKeysSetKey(clerkId);
      const invalidatedCount = await invalidateRedisSnapshot(
        publisher,
        keysSetKey,
      );

      this.logger.debug(
        `Invalidated ${invalidatedCount} context key(s) for user ${clerkId}`,
        this.context,
      );
    } catch (error: unknown) {
      this.logger.error(
        `Failed to invalidate context for user ${clerkId}`,
        error,
        this.context,
      );
    }
  }

  /**
   * Invalidate all cached contexts for a given organization ID.
   * Uses SCAN to find matching keys (pattern: rc:*:<orgId>*).
   */
  async invalidateForOrganization(organizationId: string): Promise<void> {
    const publisher = this.redisService.getPublisher();
    if (!publisher) {
      return;
    }

    try {
      const pattern = `${RC_PREFIX}:*:${organizationId}*`;
      const keys = await collectRedisKeysByPattern(publisher, pattern);

      if (keys.length > 0) {
        await publisher.unlink(keys);
      }

      this.logger.debug(
        `Invalidated ${keys.length} context key(s) for organization ${organizationId}`,
        this.context,
      );
    } catch (error: unknown) {
      this.logger.error(
        `Failed to invalidate context for organization ${organizationId}`,
        error,
        this.context,
      );
    }
  }
}
