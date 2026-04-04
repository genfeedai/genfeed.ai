import { CacheClientService } from '@api/services/cache/services/cache-client.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import type { RedisClientType } from 'redis';

/**
 * CacheInvalidationService
 *
 * Low-level Redis invalidation helpers that complement the tag-based
 * CacheService.invalidateByTags() for explicit key-based busting.
 *
 * Prefer tag-based invalidation for most cases. Use this service when:
 * - You need to bust a specific key (e.g. brands:list:{orgId})
 * - You need to scan and bust keys matching a glob pattern
 *
 * Uses Redis UNLINK (async DEL) for non-blocking eviction.
 */
@Injectable()
export class CacheInvalidationService {
  private readonly constructorName = this.constructor.name;

  constructor(
    private readonly cacheClientService: CacheClientService,
    private readonly logger: LoggerService,
  ) {}

  private get client(): RedisClientType {
    return this.cacheClientService.instance;
  }

  /**
   * Bust one or more specific cache keys.
   * No-ops silently when keys array is empty.
   */
  async invalidate(...keys: string[]): Promise<void> {
    if (!keys.length) {
      return;
    }

    try {
      await this.client.unlink(keys);
      this.logger.debug(`${this.constructorName} invalidated keys`, { keys });
    } catch (error: unknown) {
      this.logger.error(`${this.constructorName} invalidate error`, {
        error,
        keys,
      });
    }
  }

  /**
   * Scan Redis for all keys matching a glob pattern and unlink them.
   *
   * Uses SCAN + UNLINK to avoid blocking the server on large keyspaces.
   * Example pattern: `brands:list:*`
   */
  async invalidatePattern(pattern: string): Promise<void> {
    try {
      let cursor = '0';
      let totalUnlinked = 0;

      do {
        const reply = await this.client.scan(cursor, {
          COUNT: 100,
          MATCH: pattern,
        });

        cursor = reply.cursor;
        const keys = reply.keys as string[];

        if (keys.length) {
          await this.client.unlink(keys);
          totalUnlinked += keys.length;
        }
      } while (cursor !== '0');

      if (totalUnlinked > 0) {
        this.logger.debug(
          `${this.constructorName} invalidatePattern unlinked ${totalUnlinked} keys`,
          { pattern },
        );
      }
    } catch (error: unknown) {
      this.logger.error(`${this.constructorName} invalidatePattern error`, {
        error,
        pattern,
      });
    }
  }
}
