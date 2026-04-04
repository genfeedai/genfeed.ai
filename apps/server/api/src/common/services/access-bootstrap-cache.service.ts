import {
  collectRedisKeysByPattern,
  invalidateRedisSnapshot,
  storeRedisSnapshot,
} from '@api/common/services/redis-cache-snapshot.helper';
import type {
  IBrand,
  IDarkroomCapabilities,
  IOrganizationSetting,
  IUser,
} from '@genfeedai/interfaces';
import type { IStreakSummary } from '@genfeedai/types';
import { LoggerService } from '@libs/logger/logger.service';
import { RedisService } from '@libs/redis/redis.service';
import { Injectable } from '@nestjs/common';

export interface AccessBootstrapStatePayload {
  userId: string;
  organizationId: string;
  brandId: string;
  isSuperAdmin: boolean;
  isOnboardingCompleted: boolean;
  subscriptionStatus: string;
  subscriptionTier: string;
  hasEverHadCredits: boolean;
  creditsBalance: number;
}

export interface AccessBootstrapCachePayload {
  access: AccessBootstrapStatePayload;
  brands: IBrand[];
  currentUser: IUser | null;
  darkroomCapabilities: IDarkroomCapabilities | null;
  settings: IOrganizationSetting | null;
  streak: IStreakSummary | null;
}

const ACCESS_BOOTSTRAP_PREFIX = 'access-bootstrap';
const ACCESS_BOOTSTRAP_TTL_SECONDS = 30;
const ACCESS_BOOTSTRAP_KEYS_SET_TTL_SECONDS = 3_600;

function buildAccessBootstrapKey(clerkId: string, organizationId: string) {
  return `${ACCESS_BOOTSTRAP_PREFIX}:${clerkId}:${organizationId}`;
}

function buildAccessBootstrapKeysSetKey(clerkId: string) {
  return `${ACCESS_BOOTSTRAP_PREFIX}:keys:${clerkId}`;
}

@Injectable()
export class AccessBootstrapCacheService {
  private readonly context = { service: AccessBootstrapCacheService.name };

  constructor(
    private readonly redisService: RedisService,
    private readonly logger: LoggerService,
  ) {}

  async get(
    clerkId: string,
    organizationId: string,
  ): Promise<AccessBootstrapCachePayload | null> {
    const publisher = this.redisService.getPublisher();
    if (!publisher) {
      return null;
    }

    try {
      const cached = await publisher.get(
        buildAccessBootstrapKey(clerkId, organizationId),
      );

      if (!cached) {
        return null;
      }

      return JSON.parse(cached) as AccessBootstrapCachePayload;
    } catch (error: unknown) {
      this.logger.error(
        `Failed to read access bootstrap cache for user ${clerkId}`,
        error,
        this.context,
      );
      return null;
    }
  }

  async set(
    clerkId: string,
    organizationId: string,
    payload: AccessBootstrapCachePayload,
  ): Promise<void> {
    const publisher = this.redisService.getPublisher();
    if (!publisher) {
      return;
    }

    try {
      const cacheKey = buildAccessBootstrapKey(clerkId, organizationId);
      const keysSetKey = buildAccessBootstrapKeysSetKey(clerkId);

      await storeRedisSnapshot(
        publisher,
        cacheKey,
        keysSetKey,
        ACCESS_BOOTSTRAP_TTL_SECONDS,
        ACCESS_BOOTSTRAP_KEYS_SET_TTL_SECONDS,
        payload,
      );
    } catch (error: unknown) {
      this.logger.error(
        `Failed to write access bootstrap cache for user ${clerkId}`,
        error,
        this.context,
      );
    }
  }

  async invalidateForUser(clerkId: string): Promise<void> {
    const publisher = this.redisService.getPublisher();
    if (!publisher) {
      return;
    }

    try {
      const keysSetKey = buildAccessBootstrapKeysSetKey(clerkId);
      const invalidatedCount = await invalidateRedisSnapshot(
        publisher,
        keysSetKey,
      );

      this.logger.debug(
        `Invalidated ${invalidatedCount} access bootstrap key(s) for user ${clerkId}`,
        this.context,
      );
    } catch (error: unknown) {
      this.logger.error(
        `Failed to invalidate access bootstrap cache for user ${clerkId}`,
        error,
        this.context,
      );
    }
  }

  async invalidateForOrganization(organizationId: string): Promise<void> {
    const publisher = this.redisService.getPublisher();
    if (!publisher) {
      return;
    }

    try {
      const pattern = `${ACCESS_BOOTSTRAP_PREFIX}:*:${organizationId}`;
      const keys = await collectRedisKeysByPattern(publisher, pattern);

      if (keys.length > 0) {
        await publisher.unlink(keys);
      }

      this.logger.debug(
        `Invalidated ${keys.length} access bootstrap key(s) for organization ${organizationId}`,
        this.context,
      );
    } catch (error: unknown) {
      this.logger.error(
        `Failed to invalidate access bootstrap cache for organization ${organizationId}`,
        error,
        this.context,
      );
    }
  }
}
