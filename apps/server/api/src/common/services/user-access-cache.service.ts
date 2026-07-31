import { AccessBootstrapCacheService } from '@api/common/services/access-bootstrap-cache.service';
import { BetterAuthIdentityCacheService } from '@api/common/services/better-auth-identity-cache.service';
import { RequestContextCacheService } from '@api/common/services/request-context-cache.service';
import { Injectable } from '@nestjs/common';

/**
 * Single fan-out for every cache keyed on a canonical Genfeed user id.
 *
 * Callers that change what a user may reach — role, org membership, active
 * org/brand — invalidate through here rather than listing the caches
 * themselves, so a newly added cache reaches every call site at once.
 */
@Injectable()
export class UserAccessCacheService {
  constructor(
    private readonly requestContextCacheService: RequestContextCacheService,
    private readonly accessBootstrapCacheService: AccessBootstrapCacheService,
    private readonly betterAuthIdentityCacheService: BetterAuthIdentityCacheService,
  ) {}

  async invalidateAll(userId: string): Promise<void> {
    await Promise.all([
      this.requestContextCacheService.invalidateForUser(userId),
      this.accessBootstrapCacheService.invalidateForUser(userId),
      this.betterAuthIdentityCacheService.invalidateForUser(userId),
    ]);
  }
}
