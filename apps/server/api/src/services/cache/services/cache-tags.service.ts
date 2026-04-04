import { CacheClientService } from '@api/services/cache/services/cache-client.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { RedisClientType } from 'redis';

@Injectable()
export class CacheTagsService {
  private readonly constructorName = this.constructor.name;

  constructor(
    private readonly cacheClientService: CacheClientService,
    private readonly logger: LoggerService,
  ) {}

  private get client(): RedisClientType {
    return this.cacheClientService.instance;
  }

  async setTags(key: string, tags: string[]): Promise<void> {
    if (!tags.length) {
      return;
    }

    try {
      const pipeline = this.client.multi();
      for (const tag of tags) {
        pipeline.sAdd(`tag:${tag}`, key);
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
    try {
      let invalidatedCount = 0;

      for (const tag of tags) {
        const taggedKeys = await this.client.sMembers(`tag:${tag}`);
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
