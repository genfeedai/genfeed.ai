import { RedisCacheInterceptor } from '@api/cache/redis/redis-cache.interceptor';
import { CacheStrategies } from '@api/services/cache/cache-strategies';
import { AggregationCacheStrategy } from '@api/services/cache/strategies/aggregation-cache.strategy';
import { BrandCacheStrategy } from '@api/services/cache/strategies/brand-cache.strategy';
import { PublicationCacheStrategy } from '@api/services/cache/strategies/publication-cache.strategy';
import { UserCacheStrategy } from '@api/services/cache/strategies/user-cache.strategy';
import { VideoCacheStrategy } from '@api/services/cache/strategies/video-cache.strategy';
import { VoteCacheStrategy } from '@api/services/cache/strategies/vote-cache.strategy';
import { Global, Module } from '@nestjs/common';
import { CacheInvalidationService } from '@server/common/services/cache-invalidation.service';
import { CacheModule as ServerCacheModule } from '@server/services/cache/cache.module';

@Global()
@Module({
  exports: [
    ServerCacheModule,
    CacheInvalidationService,
    CacheStrategies,
    RedisCacheInterceptor,
  ],
  imports: [ServerCacheModule],
  providers: [
    AggregationCacheStrategy,
    CacheInvalidationService,
    BrandCacheStrategy,
    CacheStrategies,
    PublicationCacheStrategy,
    RedisCacheInterceptor,
    UserCacheStrategy,
    VideoCacheStrategy,
    VoteCacheStrategy,
  ],
})
export class CacheModule {}
