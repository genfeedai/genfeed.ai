import * as crypto from 'node:crypto';
import { CreateApiKeyDto } from '@api/collections/api-keys/dto/create-api-key.dto';
import { UpdateApiKeyDto } from '@api/collections/api-keys/dto/update-api-key.dto';
import type { ApiKeyDocument } from '@api/collections/api-keys/schemas/api-key.schema';
import {
  CACHE_PATTERNS,
  CACHE_TAGS,
} from '@api/common/constants/cache-patterns.constants';
import { CacheInvalidationService } from '@api/common/services/cache-invalidation.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { IS_CLOUD_MODE } from '@genfeedai/config';
import { ApiKeyScope } from '@genfeedai/enums';
import { getApiRateLimitForTier } from '@genfeedai/pricing';
import type { Prisma } from '@genfeedai/prisma';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { RedisService } from '@libs/redis/redis.service';
import { BadRequestException, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

/**
 * Every scope the platform recognizes. Any scope outside this set — including
 * the wildcard "*" — is rejected at key creation/rotation, so a leaked or
 * over-scoped key can never satisfy checks for permissions the platform does
 * not define. The public create endpoint is further restricted to the
 * self-service preset union (see CreateApiKeyDto); this set is the broader
 * server-side floor that also covers managed/system keys minted internally.
 */
const KNOWN_API_KEY_SCOPES: ReadonlySet<string> = new Set(
  Object.values(ApiKeyScope),
);

const DEFAULT_API_KEY_SCOPES: readonly string[] = [
  'videos:create',
  'videos:read',
  'images:create',
  'images:read',
  'analytics:read',
];

@Injectable()
export class ApiKeysService extends BaseService<
  ApiKeyDocument,
  CreateApiKeyDto,
  UpdateApiKeyDto,
  Prisma.ApiKeyWhereInput
> {
  private static readonly RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute sliding window

  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    private readonly cacheInvalidationService: CacheInvalidationService,
  ) {
    super(prisma, 'apiKey', logger);
  }

  /**
   * Generate a secure API key
   */
  generateApiKey(): string {
    // Format: gf_live_<random_string> or gf_test_<random_string>
    const prefix = this.configService.isProduction ? 'gf_live' : 'gf_test';
    const randomBytes = crypto.randomBytes(32).toString('base64url');
    return `${prefix}_${randomBytes}`;
  }

  /**
   * Compute a fingerprint (SHA-256 of the first 16 chars) for fast indexed lookup.
   */
  computeFingerprint(plainKey: string): string {
    return crypto
      .createHash('sha256')
      .update(plainKey.substring(0, 16))
      .digest('hex');
  }

  /**
   * Hash an API key for storage
   */
  hashApiKey(key: string): Promise<string> {
    return bcrypt.hash(key, 10);
  }

  /**
   * Verify an API key against its hash
   */
  verifyApiKey(plainKey: string, hashedKey: string): Promise<boolean> {
    return bcrypt.compare(plainKey, hashedKey);
  }

  /**
   * Create a new API key with hashing
   */
  async createWithKey(
    createApiKeyDto: CreateApiKeyDto & {
      userId: string;
      organizationId: string;
    },
  ): Promise<{ apiKey: ApiKeyDocument; plainKey: string }> {
    const scopes = createApiKeyDto.scopes ?? [...DEFAULT_API_KEY_SCOPES];
    this.assertValidScopes(scopes);

    const plainKey = this.generateApiKey();
    const hashedKey = await this.hashApiKey(plainKey);
    const keyFingerprint = this.computeFingerprint(plainKey);

    const apiKeyData = {
      ...createApiKeyDto,
      isRevoked: false,
      key: hashedKey,
      keyFingerprint,
      rateLimit: createApiKeyDto.rateLimit || 60,
      scopes,
      usageCount: 0,
    };

    const apiKey = await this.create(apiKeyData);

    // Return both the document and the plain key (only shown once)
    return { apiKey: apiKey, plainKey };
  }

  async rotateWithKey(
    keyId: string,
    createApiKeyDto: CreateApiKeyDto & {
      userId: string;
      organizationId: string;
    },
  ): Promise<{ apiKey: ApiKeyDocument; plainKey: string }> {
    const replacement = await this.createWithKey(createApiKeyDto);

    try {
      await this.revoke(keyId);
    } catch (error) {
      // The original key could not be retired — roll back the replacement so we
      // don't leave two active keys for the same logical credential, then
      // surface the failure to the caller.
      try {
        await this.revoke(replacement.apiKey.id);
      } catch (cleanupError) {
        this.logger?.error('Failed to clean up replacement API key', {
          cleanupError,
          originalKeyId: keyId,
          replacementKeyId: replacement.apiKey.id,
        });
      }

      throw error;
    }

    // Rotation has logically succeeded: the original key is revoked and the new
    // key has already been issued to the caller. Cache invalidation is
    // best-effort — a Redis failure here must never revoke the freshly issued
    // replacement and leave the user with zero valid keys.
    try {
      await this.invalidateRotationCaches(
        createApiKeyDto.organizationId,
        keyId,
        replacement.apiKey.id,
      );
    } catch (cacheError) {
      this.logger?.error('Failed to invalidate API key caches after rotation', {
        cacheError,
        originalKeyId: keyId,
        replacementKeyId: replacement.apiKey.id,
      });
    }

    return replacement;
  }

  private async invalidateRotationCaches(
    organizationId: string,
    originalKeyId: string,
    replacementKeyId: string,
  ): Promise<void> {
    await this.cacheInvalidationService.invalidate(
      CACHE_PATTERNS.API_KEYS_LIST(organizationId),
      CACHE_PATTERNS.API_KEYS_SINGLE(originalKeyId),
      CACHE_PATTERNS.API_KEYS_SINGLE(replacementKeyId),
    );
    await this.cacheInvalidationService.invalidateByTags([CACHE_TAGS.API_KEYS]);
  }

  /**
   * Find an API key by its plain text value.
   * Uses fingerprint index for O(1) lookup, with a legacy full-scan fallback
   * for keys created before fingerprinting was introduced.
   */
  async findByKey(plainKey: string): Promise<ApiKeyDocument | null> {
    const fingerprint = this.computeFingerprint(plainKey);
    const now = new Date();

    // Fast path: query by indexed fingerprint
    const fingerprintMatches = await this.delegate.findMany({
      where: {
        isRevoked: false,
        keyFingerprint: fingerprint,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      take: 10,
    });

    for (const key of fingerprintMatches as ApiKeyDocument[]) {
      const isValid = await this.verifyApiKey(plainKey, key.key);
      if (isValid) {
        await this.updateLastUsed(key.id);
        return key;
      }
    }

    // Legacy fallback: scan all active keys without a fingerprint
    const legacyMatches = await this.delegate.findMany({
      where: {
        isRevoked: false,
        keyFingerprint: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      take: 200,
    });

    for (const key of legacyMatches as ApiKeyDocument[]) {
      const isValid = await this.verifyApiKey(plainKey, key.key);
      if (isValid) {
        // Backfill fingerprint so future lookups are fast
        await this.delegate.update({
          where: { id: key.id },
          data: { keyFingerprint: fingerprint },
        });
        await this.updateLastUsed(key.id);
        return key;
      }
    }

    return null;
  }

  /**
   * Update last used timestamp and increment usage count
   */
  async updateLastUsed(keyId: string, ip?: string): Promise<void> {
    await this.delegate.update({
      where: { id: keyId },
      data: {
        usageCount: { increment: 1 },
        lastUsedAt: new Date(),
        lastUsedIp: ip,
      },
    });
  }

  /**
   * Revoke an API key
   */
  revoke(keyId: string): Promise<ApiKeyDocument | null> {
    return this.patch(keyId, {
      isRevoked: true,
      revokedAt: new Date(),
    } as unknown as Partial<UpdateApiKeyDto>);
  }

  /**
   * Reject scopes the platform does not define, including the wildcard "*".
   * Enforced for every key (self-service and managed) before persistence so an
   * over-scoped or wildcard key can never be created or carried across rotation.
   */
  assertValidScopes(scopes: readonly string[]): void {
    const invalid = scopes.filter((scope) => !KNOWN_API_KEY_SCOPES.has(scope));
    if (invalid.length > 0) {
      throw new BadRequestException(
        `Unknown or disallowed API key scope(s): ${invalid.join(', ')}`,
      );
    }
  }

  /**
   * Check if an API key has a specific scope. Membership is exact — there is no
   * wildcard: a key only satisfies checks for scopes explicitly granted to it.
   */
  hasScope(apiKey: ApiKeyDocument, scope: string): boolean {
    return apiKey.scopes.includes(scope);
  }

  /**
   * Validate IP restriction
   */
  isIpAllowed(apiKey: ApiKeyDocument, ip: string): boolean {
    if (!apiKey.allowedIps || apiKey.allowedIps.length === 0) {
      return true; // No IP restriction
    }
    return apiKey.allowedIps.includes(ip);
  }

  /**
   * Resolve the effective per-minute request ceiling for an API-key request.
   *
   * In managed cloud, the org's subscription tier governs ("Model B"): the tier
   * limit overrides the per-key value, so a downgraded org is throttled to its
   * current entitlement. `null` = no platform-enforced ceiling (Enterprise
   * custom); `0` = the tier has no API access at all.
   *
   * In self-hosted / community / desktop deployments there are no tiers, so the
   * historical per-key limit is honored unchanged (a falsy per-key limit stays
   * "unlimited", matching the prior behavior).
   */
  async resolveEffectiveRateLimit(
    apiKey: ApiKeyDocument,
  ): Promise<number | null> {
    if (!IS_CLOUD_MODE) {
      return apiKey.rateLimit || null;
    }

    const tier = await this.resolveOrganizationTier(apiKey.organizationId);
    return getApiRateLimitForTier(tier);
  }

  /**
   * Read the org's subscription tier from OrganizationSetting, scoped by the
   * (unique) organizationId — the tenant boundary for this lookup. Returns null
   * when no org/setting is found (default-deny in cloud).
   */
  private async resolveOrganizationTier(
    organizationId: string | null | undefined,
  ): Promise<string | null> {
    if (!organizationId) {
      return null;
    }

    const setting = await this.prisma.organizationSetting.findUnique({
      select: { subscriptionTier: true },
      where: { organizationId },
    });

    return setting?.subscriptionTier ?? null;
  }

  /**
   * Check rate limit using Redis sliding window.
   * Tracks requests in a sorted set with timestamps.
   * The effective limit is the org's per-tier ceiling in managed cloud, or the
   * per-key limit off cloud. Returns true if within limit, false if exceeded
   * or if the org's tier has no API access.
   */
  async checkRateLimit(apiKey: ApiKeyDocument): Promise<boolean> {
    const effectiveLimit = await this.resolveEffectiveRateLimit(apiKey);

    // No platform-enforced ceiling (Enterprise custom, or non-cloud unlimited).
    if (effectiveLimit === null) {
      return true;
    }

    // A zero/negative ceiling means the tier has no API access → deny.
    if (effectiveLimit <= 0) {
      this.logger?.warn('API key request denied — tier lacks API access', {
        apiKeyId: apiKey.id,
        organizationId: apiKey.organizationId,
      });
      return false;
    }

    const client = this.redisService.getPublisher();
    if (!client) {
      // Redis unavailable - allow request but log warning
      this.logger?.warn(
        'Redis unavailable for rate limiting, allowing request',
      );
      return true;
    }

    const key = `rateLimit:${apiKey.id}`;
    const now = Date.now();
    const windowStart = now - ApiKeysService.RATE_LIMIT_WINDOW_MS;

    try {
      // Remove expired entries outside the sliding window
      await client.zremrangebyscore(key, 0, windowStart);

      // Count requests in the current window
      const requestCount = await client.zcard(key);

      if (requestCount >= effectiveLimit) {
        this.logger?.warn('API key rate limit exceeded', {
          apiKeyId: apiKey.id,
          limit: effectiveLimit,
          requestCount,
        });
        return false;
      }

      // Add the current request with timestamp as both score and member
      // Use timestamp + random suffix to ensure unique members
      const member = `${now}:${crypto.randomBytes(4).toString('hex')}`;
      await client.zadd(key, now, member);

      // Set TTL on the key to auto-cleanup (slightly longer than the window)
      await client.expire(
        key,
        Math.ceil(ApiKeysService.RATE_LIMIT_WINDOW_MS / 1000) + 10,
      );

      return true;
    } catch (error: unknown) {
      this.logger?.error('Rate limit check failed', {
        apiKeyId: apiKey.id,
        error: (error as Error)?.message,
      });
      // On Redis errors, allow the request to avoid blocking users
      return true;
    }
  }
}
