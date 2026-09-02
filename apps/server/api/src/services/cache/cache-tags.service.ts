import { CacheClientService } from '@api/services/cache/cache-client.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import type Redis from 'ioredis';

@Injectable()
export class CacheTagsService {
  private readonly constructorName = this.constructor.name;

  constructor(
    private readonly cacheClientService: CacheClientService,
    private readonly logger: LoggerService,
  ) {}

  private get client(): Redis {
    return this.cacheClientService.instance;
  }

  /**
   * Whether the cache client can accept a command right now.
   *
   * Mirrors the gate in `CacheService`: a command issued while ioredis is
   * disconnected sits in its offline queue and never settles, so the `try/catch`
   * below cannot degrade it — only a rejection is catchable, and a hang is not.
   */
  private get isAvailable(): boolean {
    return this.cacheClientService.isReady;
  }

  async setTags(key: string, tags: string[]): Promise<void> {
    if (!tags.length || !this.isAvailable) {
      return;
    }

    try {
      const pipeline = this.client.multi();
      for (const tag of tags) {
        pipeline.sadd(`tag:${tag}`, key);
      }
      await pipeline.exec();
    } catch (error: unknown) {
      this.logger.error(`${this.constructorName} setTags error`, {
        error,
        key,
        tags,
      });
    }
  }

  async invalidateByTags(tags: string[]): Promise<number> {
    if (!this.isAvailable) {
      return 0;
    }

    try {
      let invalidatedCount = 0;

      for (const tag of tags) {
        const taggedKeys = await this.client.smembers(`tag:${tag}`);
        if (!taggedKeys.length) {
          continue;
        }

        const pipeline = this.client.multi();
        for (const key of taggedKeys) {
          pipeline.del(key);
        }
        pipeline.del(`tag:${tag}`);

        await pipeline.exec();
        invalidatedCount += taggedKeys.length;
      }

      if (invalidatedCount > 0) {
        this.logger.debug(
          `${this.constructorName} invalidated ${invalidatedCount} keys by tags`,
          { tags },
        );
      }
      return invalidatedCount;
    } catch (error: unknown) {
      this.logger.error(`${this.constructorName} invalidateByTags error`, {
        error,
        tags,
      });
      return 0;
    }
  }
}
