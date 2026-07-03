import { AccessBootstrapCacheService } from '@api/common/services/access-bootstrap-cache.service';
import { BetterAuthIdentityCacheService } from '@api/common/services/better-auth-identity-cache.service';
import { RequestContextCacheService } from '@api/common/services/request-context-cache.service';
import { Module } from '@nestjs/common';

@Module({
  exports: [
    AccessBootstrapCacheService,
    BetterAuthIdentityCacheService,
    RequestContextCacheService,
  ],
  providers: [
    AccessBootstrapCacheService,
    BetterAuthIdentityCacheService,
    RequestContextCacheService,
  ],
})
export class CommonModule {}
