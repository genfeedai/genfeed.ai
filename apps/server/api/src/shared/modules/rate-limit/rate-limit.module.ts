import { CacheModule } from '@server/services/cache/cache.module';
import { RateLimitGuard } from '@api/shared/guards/rate-limit/rate-limit.guard';
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

@Module({
  exports: [],
  imports: [CacheModule],
  providers: [
    {
      provide: APP_GUARD,
      useClass: RateLimitGuard,
    },
  ],
})
export class RateLimitModule {}
