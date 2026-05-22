import { CacheModule } from '@api/services/cache/cache.module';
import { RateLimitGuard } from '@api/shared/guards/rate-limit/rate-limit.guard';
import { forwardRef, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

@Module({
  exports: [],
  imports: [forwardRef(() => CacheModule)],
  providers: [
    {
      provide: APP_GUARD,
      useClass: RateLimitGuard,
    },
  ],
})
export class RateLimitModule {}
