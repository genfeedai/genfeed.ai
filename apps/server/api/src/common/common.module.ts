import { AccessBootstrapCacheService } from '@api/common/services/access-bootstrap-cache.service';
import { BetterAuthIdentityCacheService } from '@api/common/services/better-auth-identity-cache.service';
import { RequestContextCacheService } from '@api/common/services/request-context-cache.service';
import { UserAccessCacheService } from '@api/common/services/user-access-cache.service';
import { Module } from '@nestjs/common';

@Module({
  exports: [
    AccessBootstrapCacheService,
    BetterAuthIdentityCacheService,
    RequestContextCacheService,
    UserAccessCacheService,
  ],
  providers: [
    AccessBootstrapCacheService,
    BetterAuthIdentityCacheService,
    RequestContextCacheService,
    UserAccessCacheService,
  ],
})
export class CommonModule {}
