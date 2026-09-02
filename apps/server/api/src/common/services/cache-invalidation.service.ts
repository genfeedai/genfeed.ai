import { CacheClientService } from '@api/services/cache/cache-client.service';
import { CacheTagsService } from '@api/services/cache/cache-tags.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import type Redis from 'ioredis';

@Injectable()
export class CacheInvalidationService {
  private readonly constructorName = this.constructor.name;

  constructor(
    private readonly cacheClientService: CacheClientService,
    private readonly cacheTagsService: CacheTagsService,
    private readonly logger: LoggerService,
  ) {}

  private get client(): Redis {
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
   * Bust every key registered under the given tags (SMEMBERS + pipelined DEL).
   *
   * This is the only fan-out invalidation primitive: cost is proportional to
   * the keys actually cached under the tag, never to Redis keyspace size.
   * Keys must be registered under their tags at set time (CacheService `tags`
   * option / CacheTagsService.setTags) — pattern SCAN invalidation is retired
   * from write paths.
   */
  async invalidateByTags(tags: string[]): Promise<number> {
    try {
      const count = await this.cacheTagsService.invalidateByTags(tags);
      this.logger.debug(
        `${this.constructorName} invalidated ${count} keys by tags`,
        { tags },
      );
      return count;
    } catch (error: unknown) {
      this.logger.error(`${this.constructorName} invalidateByTags error`, {
        error,
        tags,
      });
      return 0;
    }
  }

  async invalidateForUser(userId: string): Promise<void> {
    await this.invalidateByTags([`user:${userId}`]);
  }

  async invalidateForController(controllerName: string): Promise<void> {
    await this.invalidateByTags([controllerName.toLowerCase()]);
  }
}
