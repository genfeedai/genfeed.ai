import type { IBetterAuthResolvedIdentity } from '@api/auth/better-auth/better-auth.types';
import { LoggerService } from '@libs/logger/logger.service';
import { RedisService } from '@libs/redis/redis.service';
import { Injectable } from '@nestjs/common';

const IDENTITY_PREFIX = 'ba-identity';
// Short TTL bounds staleness for identity mutations that don't flow through the
// explicit invalidation choke points (e.g. member deactivation); org/brand
// switches invalidate eagerly via invalidateForUser.
const IDENTITY_TTL_SECONDS = 120;

function buildIdentityKey(userId: string): string {
  return `${IDENTITY_PREFIX}:${userId}`;
}

/**
 * Redis cache for the resolved Better Auth identity (org + brand + super-admin),
 * keyed by the JWT `sub` (genfeed `User.id`). Sits in front of
 * `BetterAuthIdentityResolverService.resolve()` so the per-request auth hot
 * path collapses from ~5 sequential DB queries to a single Redis GET.
 *
 * Invalidated alongside `RequestContextCacheService` / `AccessBootstrapCacheService`
 * wherever `lastUsedOrganizationId` / `lastUsedBrandId` change.
 */
@Injectable()
export class BetterAuthIdentityCacheService {
  private readonly context = { service: BetterAuthIdentityCacheService.name };

  constructor(
    private readonly redisService: RedisService,
    private readonly logger: LoggerService,
  ) {}

  async get(userId: string): Promise<IBetterAuthResolvedIdentity | null> {
    const publisher = this.redisService.getPublisher();
    if (!publisher) {
      return null;
    }

    try {
      const cached = await publisher.get(buildIdentityKey(userId));
      if (!cached) {
        return null;
      }
      return JSON.parse(cached) as IBetterAuthResolvedIdentity;
    } catch (error: unknown) {
      this.logger.error(
        `Failed to read identity cache for user ${userId}`,
        error,
        this.context,
      );
      return null;
    }
  }

  async set(
    userId: string,
    identity: IBetterAuthResolvedIdentity,
  ): Promise<void> {
    const publisher = this.redisService.getPublisher();
    if (!publisher) {
      return;
    }

    try {
      await publisher.setex(
        buildIdentityKey(userId),
        IDENTITY_TTL_SECONDS,
        JSON.stringify(identity),
      );
    } catch (error: unknown) {
      this.logger.error(
        `Failed to write identity cache for user ${userId}`,
        error,
        this.context,
      );
    }
  }

  async invalidateForUser(userId: string): Promise<void> {
    const publisher = this.redisService.getPublisher();
    if (!publisher) {
      return;
    }

    try {
      await publisher.unlink(buildIdentityKey(userId));
    } catch (error: unknown) {
      this.logger.error(
        `Failed to invalidate identity cache for user ${userId}`,
        error,
        this.context,
      );
    }
  }
}
