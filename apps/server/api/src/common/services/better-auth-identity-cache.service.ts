import type { IBetterAuthResolvedIdentity } from '@api/auth/better-auth/better-auth.types';
import { LoggerService } from '@libs/logger/logger.service';
import { RedisService } from '@libs/redis/redis.service';
import { Traced } from '@libs/tracing/traced';
import { Injectable } from '@nestjs/common';

const IDENTITY_PREFIX = 'ba-identity';
// Short TTL bounds staleness for identity mutations that don't flow through the
// explicit invalidation choke points (e.g. member deactivation); org/brand
// switches invalidate eagerly via invalidateForUser.
const IDENTITY_TTL_SECONDS = 120;

// Outlives any resolve that could be in flight when an invalidation lands.
const EPOCH_TTL_SECONDS = 24 * 60 * 60;

function buildIdentityKey(userId: string): string {
  return `${IDENTITY_PREFIX}:${userId}`;
}

function buildEpochKey(userId: string): string {
  return `${IDENTITY_PREFIX}-epoch:${userId}`;
}

/**
 * Stores the identity only while the user's invalidation epoch is still the one
 * the caller read before resolving. Check and write are one atomic step.
 * KEYS: identity key, epoch key. ARGV: expected epoch, ttl, serialized identity.
 */
const SET_IF_EPOCH_UNCHANGED_SCRIPT = `
local current = redis.call('GET', KEYS[2])
if not current then current = '0' end
if current ~= ARGV[1] then return 0 end
redis.call('SETEX', KEYS[1], ARGV[2], ARGV[3])
return 1
`;

/**
 * Redis cache for the resolved Better Auth identity (org + brand + super-admin),
 * keyed by the JWT `sub` (genfeed `User.id`). Sits in front of
 * `BetterAuthIdentityResolverService.resolve()` so the per-request auth hot
 * path collapses from ~5 sequential DB queries to a single Redis GET.
 *
 * Invalidated alongside `RequestContextCacheService` / `AccessBootstrapCacheService`
 * wherever `lastUsedOrganizationId` / `currentBrandId` change.
 */
@Traced()
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

  /**
   * The user's current invalidation epoch, or `null` when Redis cannot answer.
   * Read it BEFORE resolving the identity and pass it to `setIfUnchanged`.
   */
  async readEpoch(userId: string): Promise<string | null> {
    const publisher = this.redisService.getPublisher();
    if (!publisher) {
      return null;
    }

    try {
      return (await publisher.get(buildEpochKey(userId))) ?? '0';
    } catch (error: unknown) {
      this.logger.error(
        `Failed to read identity cache epoch for user ${userId}`,
        error,
        this.context,
      );
      return null;
    }
  }

  /**
   * Caches the identity unless `invalidateForUser` ran after `epoch` was read,
   * so a resolve that started before an organization switch cannot write the
   * pre-switch identity back.
   */
  async setIfUnchanged(
    userId: string,
    identity: IBetterAuthResolvedIdentity,
    epoch: string | null,
  ): Promise<void> {
    const publisher = this.redisService.getPublisher();
    if (!publisher || epoch === null) {
      return;
    }

    try {
      await publisher.eval(
        SET_IF_EPOCH_UNCHANGED_SCRIPT,
        2,
        buildIdentityKey(userId),
        buildEpochKey(userId),
        epoch,
        String(IDENTITY_TTL_SECONDS),
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
      await publisher
        .multi()
        .incr(buildEpochKey(userId))
        .expire(buildEpochKey(userId), EPOCH_TTL_SECONDS)
        .unlink(buildIdentityKey(userId))
        .exec();
    } catch (error: unknown) {
      this.logger.error(
        `Failed to invalidate identity cache for user ${userId}`,
        error,
        this.context,
      );
    }
  }
}
