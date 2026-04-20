import * as crypto from 'node:crypto';
import { CreateApiKeyDto } from '@api/collections/api-keys/dto/create-api-key.dto';
import { UpdateApiKeyDto } from '@api/collections/api-keys/dto/update-api-key.dto';
import type { ApiKeyDocument } from '@api/collections/api-keys/schemas/api-key.schema';
import { ConfigService } from '@api/config/config.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { LoggerService } from '@libs/logger/logger.service';
import { RedisService } from '@libs/redis/redis.service';
import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

@Injectable()
export class ApiKeysService extends BaseService<
  ApiKeyDocument,
  CreateApiKeyDto,
  UpdateApiKeyDto
> {
  private static readonly RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute sliding window

  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
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
    const plainKey = this.generateApiKey();
    const hashedKey = await this.hashApiKey(plainKey);
    const keyFingerprint = this.computeFingerprint(plainKey);

    const apiKeyData = {
      ...createApiKeyDto,
      isRevoked: false,
      key: hashedKey,
      keyFingerprint,
      rateLimit: createApiKeyDto.rateLimit || 60,
      scopes: createApiKeyDto.scopes || [
        'videos:create',
        'videos:read',
        'images:create',
        'images:read',
        'analytics:read',
      ],
      usageCount: 0,
    };

    const apiKey = await this.create(apiKeyData);

    // Return both the document and the plain key (only shown once)
    return { apiKey: apiKey, plainKey };
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
   * Check if an API key has a specific scope
   */
  hasScope(apiKey: ApiKeyDocument, scope: string): boolean {
    return apiKey.scopes.includes(scope) || apiKey.scopes.includes('*');
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
   * Check rate limit using Redis sliding window.
   * Tracks requests in a sorted set with timestamps.
   * Returns true if within limit, false if exceeded.
   */
  async checkRateLimit(apiKey: ApiKeyDocument): Promise<boolean> {
    if (!apiKey.rateLimit) {
      return true;
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
      await client.zRemRangeByScore(key, 0, windowStart);

      // Count requests in the current window
      const requestCount = await client.zCard(key);

      if (requestCount >= apiKey.rateLimit) {
        this.logger?.warn('API key rate limit exceeded', {
          apiKeyId: apiKey.id,
          limit: apiKey.rateLimit,
          requestCount,
        });
        return false;
      }

      // Add the current request with timestamp as both score and member
      // Use timestamp + random suffix to ensure unique members
      const member = `${now}:${crypto.randomBytes(4).toString('hex')}`;
      await client.zAdd(key, { score: now, value: member });

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
