import { CacheClientService } from '@api/services/cache/services/cache-client.service';
import { CacheTagsService } from '@api/services/cache/services/cache-tags.service';
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
        const [nextCursor, keys] = await this.client.scan(
          cursor,
          'MATCH',
          pattern,
          'COUNT',
          100,
        );

        cursor = nextCursor;

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
