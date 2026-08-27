import { Module } from '@nestjs/common';
import { CacheService } from '@server/services/cache/cache.service';
import { CacheClientService } from '@server/services/cache/cache-client.service';
import { CacheTagsService } from '@server/services/cache/cache-tags.service';

@Module({
  exports: [CacheClientService, CacheService, CacheTagsService],
  providers: [CacheClientService, CacheService, CacheTagsService],
})
export class CacheModule {}
