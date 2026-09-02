import { RedisCacheInterceptor } from '@api/cache/redis/redis-cache.interceptor';
import { CacheInvalidationService } from '@api/common/services/cache-invalidation.service';
import { CacheService } from '@api/services/cache/cache.service';
import { CacheClientService } from '@api/services/cache/cache-client.service';
import { CacheStrategies } from '@api/services/cache/cache-strategies';
import { CacheTagsService } from '@api/services/cache/cache-tags.service';
import { AggregationCacheStrategy } from '@api/services/cache/strategies/aggregation-cache.strategy';
import { BrandCacheStrategy } from '@api/services/cache/strategies/brand-cache.strategy';
import { PublicationCacheStrategy } from '@api/services/cache/strategies/publication-cache.strategy';
import { UserCacheStrategy } from '@api/services/cache/strategies/user-cache.strategy';
import { VideoCacheStrategy } from '@api/services/cache/strategies/video-cache.strategy';
import { VoteCacheStrategy } from '@api/services/cache/strategies/vote-cache.strategy';
import { Global, Module } from '@nestjs/common';

@Global()
@Module({
  exports: [
    CacheClientService,
    CacheInvalidationService,
    CacheService,
    CacheStrategies,
    CacheTagsService,
    RedisCacheInterceptor,
  ],
  providers: [
    AggregationCacheStrategy,
    BrandCacheStrategy,
    CacheClientService,
    CacheInvalidationService,
    CacheService,
    CacheStrategies,
    CacheTagsService,
    PublicationCacheStrategy,
    RedisCacheInterceptor,
    UserCacheStrategy,
    VideoCacheStrategy,
    VoteCacheStrategy,
  ],
})
export class CacheModule {}
