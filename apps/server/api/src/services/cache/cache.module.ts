import { RedisCacheInterceptor } from '@api/cache/redis/redis-cache.interceptor';
import { CacheInvalidationService } from '@api/common/services/cache-invalidation.service';
import { CacheStrategies } from '@api/services/cache/cache-strategies';
import { CacheService } from '@api/services/cache/services/cache.service';
import { CacheClientService } from '@api/services/cache/services/cache-client.service';
import { CacheKeyService } from '@api/services/cache/services/cache-key.service';
import { CacheTagsService } from '@api/services/cache/services/cache-tags.service';
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
    CacheInvalidationService,
    CacheService,
    CacheStrategies,
    RedisCacheInterceptor,
  ],
  imports: [],
  providers: [
    AggregationCacheStrategy,
    CacheInvalidationService,
    BrandCacheStrategy,
    CacheClientService,
    CacheKeyService,
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
