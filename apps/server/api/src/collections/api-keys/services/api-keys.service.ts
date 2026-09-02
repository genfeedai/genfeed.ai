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
import { isCloudDeployment } from '@genfeedai/config';
import {
  ActionOrigin,
  API_KEY_ACTION_ORIGIN_METADATA_KEY,
  API_KEY_ACTION_ORIGIN_PROOF_METADATA_KEY,
  ApiKeyScope,
} from '@genfeedai/contracts';
import { CONNECT_GENFEED_VERIFICATION_METADATA_KEY } from '@genfeedai/contracts/constants';
import { getApiRateLimitForTier } from '@genfeedai/pricing';
import type { Prisma } from '@genfeedai/prisma';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { RedisService } from '@libs/redis/redis.service';
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
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

/**
 * Result of a rate-limit check. `limit` is `null` when the caller has no
 * platform-enforced ceiling (Enterprise custom / non-cloud unlimited).
 * `retryAfterSeconds` is only meaningful when `allowed` is `false`.
 */
export interface ApiKeyRateLimitResult {
  allowed: boolean;
  limit: number | null;
  retryAfterSeconds: number;
}

@Injectable()
export class ApiKeysService extends BaseService<
  ApiKeyDocument,
  CreateApiKeyDto,
  UpdateApiKeyDto,
  Prisma.ApiKeyWhereInput
> {
  private static readonly RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute sliding window

  /**
   * Atomic sliding-window rate-limit check, ported from the MCP transport's
   * proven `RateLimitService.CONSUME_LUA` (apps/server/mcp/src/services/rate-limit.service.ts).
   * Prune expired entries → count → conditionally add the new member if under
   * the limit → refresh TTL, all in one round trip so concurrent requests for
   * the same key can never all observe the same under-limit count and burst
   * past it. Returns `[allowed(1|0), count, referenceScoreMs]` where
   * `referenceScoreMs` is the current time (allowed) or the oldest in-window
   * entry's score (blocked, used to compute Retry-After).
   */
  private static readonly RATE_LIMIT_LUA = `
    redis.call('ZREMRANGEBYSCORE', KEYS[1], 0, ARGV[2])
    local count = redis.call('ZCARD', KEYS[1])
    if count >= tonumber(ARGV[3]) then
      local oldest = redis.call('ZRANGE', KEYS[1], 0, 0, 'WITHSCORES')
      local ref = oldest[2] or ARGV[1]
      return {0, count, ref}
    end
    redis.call('ZADD', KEYS[1], ARGV[1], ARGV[4])
    redis.call('EXPIRE', KEYS[1], tonumber(ARGV[5]))
    return {1, count + 1, ARGV[1]}
  `;

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
    trustedOrigin?: ActionOrigin.CLI | ActionOrigin.MCP | ActionOrigin.UI,
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
      metadata: this.buildApiKeyMetadata(
        createApiKeyDto,
        keyFingerprint,
        trustedOrigin,
      ),
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
    trustedOrigin?: ActionOrigin.CLI | ActionOrigin.MCP | ActionOrigin.UI,
  ): Promise<{ apiKey: ApiKeyDocument; plainKey: string }> {
    const replacement = trustedOrigin
      ? await this.createWithKey(createApiKeyDto, trustedOrigin)
      : await this.createWithKey(createApiKeyDto);

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

    // Note: this method intentionally does NOT bump lastUsedAt/usageCount.
    // Callers that authenticate a real request (ApiKeyAuthGuard) call
    // updateLastUsed() themselves with the request's clientIp — doing it here
    // too used to write the same row twice per request. Callers that don't
    // represent genuine key usage (e.g. the /validate test endpoint, the
    // GitHub secret-scanning auto-revoke flow) simply no longer register a
    // "used" event, which is the correct behavior for them.
    for (const key of fingerprintMatches as ApiKeyDocument[]) {
      const isValid = await this.verifyApiKey(plainKey, key.key);
      if (isValid) {
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
        return key;
      }
    }

    return null;
  }

  /**
   * Re-read a previously authenticated key by id. Telegram caches `apiKeyId`
   * after `/connect` and must drop the chat identity when the row is revoked
   * or expired — without storing the plaintext secret.
   */
  async findActiveById(id: string): Promise<ApiKeyDocument | null> {
    const now = new Date();
    const matches = await this.delegate.findMany({
      take: 1,
      where: {
        id,
        isRevoked: false,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
    });

    return (matches[0] as ApiKeyDocument | undefined) ?? null;
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

  resolveActionOrigin(apiKey: ApiKeyDocument): ActionOrigin {
    const metadata =
      apiKey.metadata &&
      typeof apiKey.metadata === 'object' &&
      !Array.isArray(apiKey.metadata)
        ? (apiKey.metadata as Record<string, unknown>)
        : {};
    const origin = metadata[API_KEY_ACTION_ORIGIN_METADATA_KEY];
    const proof = metadata[API_KEY_ACTION_ORIGIN_PROOF_METADATA_KEY];
    if (
      (origin !== ActionOrigin.CLI &&
        origin !== ActionOrigin.MCP &&
        origin !== ActionOrigin.UI) ||
      typeof proof !== 'string'
    ) {
      return ActionOrigin.API;
    }

    const expected = this.signActionOrigin(
      origin,
      apiKey.userId,
      apiKey.organizationId,
      apiKey.keyFingerprint,
    );
    if (!expected || expected.length !== proof.length) {
      return ActionOrigin.API;
    }

    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(proof))
      ? origin
      : ActionOrigin.API;
  }

  isMcpOAuthSession(apiKey: ApiKeyDocument): boolean {
    const metadata =
      apiKey.metadata &&
      typeof apiKey.metadata === 'object' &&
      !Array.isArray(apiKey.metadata)
        ? (apiKey.metadata as Record<string, unknown>)
        : {};
    return metadata.kind === 'mcp-oauth-session';
  }

  hasTrustedMcpOriginProof(supplied: unknown): boolean {
    if (!isCloudDeployment()) {
      return true;
    }

    const configured = this.configService.get('GENFEEDAI_API_KEY');
    if (
      typeof configured !== 'string' ||
      configured.length === 0 ||
      typeof supplied !== 'string'
    ) {
      return false;
    }

    const expected = crypto
      .createHash('sha256')
      .update(configured)
      .digest('base64url');
    return (
      expected.length === supplied.length &&
      crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(supplied))
    );
  }

  private buildApiKeyMetadata(
    dto: Pick<CreateApiKeyDto, 'metadata'> & {
      organizationId: string;
      userId: string;
    },
    keyFingerprint: string,
    trustedOrigin?: ActionOrigin.CLI | ActionOrigin.MCP | ActionOrigin.UI,
  ): Record<string, unknown> | undefined {
    const {
      [API_KEY_ACTION_ORIGIN_METADATA_KEY]: _untrustedOrigin,
      [API_KEY_ACTION_ORIGIN_PROOF_METADATA_KEY]: _untrustedProof,
      [CONNECT_GENFEED_VERIFICATION_METADATA_KEY]:
        _untrustedConnectGenfeedVerification,
      ...safeMetadata
    } = dto.metadata ?? {};
    if (!trustedOrigin) {
      return dto.metadata ? safeMetadata : undefined;
    }

    const proof = this.signActionOrigin(
      trustedOrigin,
      dto.userId,
      dto.organizationId,
      keyFingerprint,
    );
    if (!proof) {
      throw new InternalServerErrorException(
        'Action-origin signing is unavailable for trusted API key issuance.',
      );
    }
    return {
      ...safeMetadata,
      [API_KEY_ACTION_ORIGIN_METADATA_KEY]: trustedOrigin,
      [API_KEY_ACTION_ORIGIN_PROOF_METADATA_KEY]: proof,
    };
  }

  private signActionOrigin(
    origin: ActionOrigin.CLI | ActionOrigin.MCP | ActionOrigin.UI,
    userId: string,
    organizationId: string,
    keyFingerprint: string | null,
  ): string | undefined {
    const secret =
      this.configService.get('GENFEEDAI_API_KEY') ||
      this.configService.get('BETTER_AUTH_SECRET');
    if (typeof secret !== 'string' || secret.length === 0) {
      return undefined;
    }

    return crypto
      .createHmac('sha256', secret)
      .update(`${origin}:${userId}:${organizationId}:${keyFingerprint ?? ''}`)
      .digest('base64url');
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
    if (!isCloudDeployment()) {
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
   * Check rate limit using an atomic Redis sliding-window Lua script (one
   * round trip instead of four sequential ZREMRANGEBYSCORE/ZCARD/ZADD/EXPIRE
   * calls). The effective limit is the org's per-tier ceiling in managed
   * cloud, or the per-key limit off cloud. `allowed` is false when the limit
   * is exceeded or the org's tier has no API access.
   */
  async checkRateLimit(apiKey: ApiKeyDocument): Promise<ApiKeyRateLimitResult> {
    const effectiveLimit = await this.resolveEffectiveRateLimit(apiKey);

    // No platform-enforced ceiling (Enterprise custom, or non-cloud unlimited).
    if (effectiveLimit === null) {
      return { allowed: true, limit: null, retryAfterSeconds: 0 };
    }

    // A zero/negative ceiling means the tier has no API access → deny.
    if (effectiveLimit <= 0) {
      this.logger?.warn('API key request denied — tier lacks API access', {
        apiKeyId: apiKey.id,
        organizationId: apiKey.organizationId,
      });
      return {
        allowed: false,
        limit: effectiveLimit,
        retryAfterSeconds: Math.ceil(
          ApiKeysService.RATE_LIMIT_WINDOW_MS / 1000,
        ),
      };
    }

    const client = this.redisService.getPublisher();
    if (!client) {
      // Redis unavailable - allow request but log warning
      this.logger?.warn(
        'Redis unavailable for rate limiting, allowing request',
      );
      return { allowed: true, limit: effectiveLimit, retryAfterSeconds: 0 };
    }

    const key = `rateLimit:${apiKey.id}`;
    const now = Date.now();
    const windowStart = now - ApiKeysService.RATE_LIMIT_WINDOW_MS;
    const ttlSeconds =
      Math.ceil(ApiKeysService.RATE_LIMIT_WINDOW_MS / 1000) + 10;
    // Timestamp + random suffix to ensure unique members
    const member = `${now}:${crypto.randomBytes(4).toString('hex')}`;

    try {
      const raw = (await client.eval(
        ApiKeysService.RATE_LIMIT_LUA,
        1,
        key,
        String(now),
        String(windowStart),
        String(effectiveLimit),
        member,
        String(ttlSeconds),
      )) as [number, number, string];

      const [allowedFlag, requestCount, referenceScore] = raw;

      if (allowedFlag === 1) {
        return { allowed: true, limit: effectiveLimit, retryAfterSeconds: 0 };
      }

      this.logger?.warn('API key rate limit exceeded', {
        apiKeyId: apiKey.id,
        limit: effectiveLimit,
        requestCount,
      });

      const oldestScoreMs = Number(referenceScore) || now;
      const resetAtMs = oldestScoreMs + ApiKeysService.RATE_LIMIT_WINDOW_MS;
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((resetAtMs - now) / 1000),
      );

      return { allowed: false, limit: effectiveLimit, retryAfterSeconds };
    } catch (error: unknown) {
      this.logger?.error('Rate limit check failed', {
        apiKeyId: apiKey.id,
        error: (error as Error)?.message,
      });
      // On Redis errors, allow the request to avoid blocking users
      return { allowed: true, limit: effectiveLimit, retryAfterSeconds: 0 };
    }
  }
}
