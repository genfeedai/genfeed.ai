import type { CreateApiKeyDto } from '@api/collections/api-keys/dto/create-api-key.dto';
import {
  ApiKey,
  type ApiKeyDocument,
} from '@api/collections/api-keys/schemas/api-key.schema';
import { ApiKeysService } from '@api/collections/api-keys/services/api-keys.service';
import { ConfigService } from '@api/config/config.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { ApiKeyCategory } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { RedisService } from '@libs/redis/redis.service';
import { getModelToken } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';

describe('ApiKeysService', () => {
  let service: ApiKeysService;
  let mockModel: Record<string, ReturnType<typeof vi.fn>>;
  let mockLogger: {
    debug: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };

  const mockApiKey: ApiKeyDocument = {
    _id: '507f1f77bcf86cd799439011',
    allowedIps: [],
    category: ApiKeyCategory.GENFEEDAI,
    createdAt: new Date(),
    description: 'A test API key',
    isRevoked: false,
    key: 'hashed_key_value',
    label: 'Test API Key',
    organization: new Types.ObjectId('507f1f77bcf86cd799439013'),
    rateLimit: 60,
    scopes: ['videos:create', 'videos:read'],
    updatedAt: new Date(),
    usageCount: 0,
    user: new Types.ObjectId('507f1f77bcf86cd799439012'),
  } as unknown as ApiKeyDocument;

  const cloneApiKey = (overrides: Partial<ApiKeyDocument> = {}) =>
    ({ ...mockApiKey, ...overrides }) as unknown as ApiKeyDocument;

  const chainable = (resolvedValue: unknown) => {
    const obj = {
      exec: vi.fn().mockResolvedValue(resolvedValue),
      lean: vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(resolvedValue),
      }),
      populate: vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(resolvedValue),
        lean: vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue(resolvedValue),
        }),
      }),
    };
    return obj;
  };

  beforeEach(async () => {
    mockModel = {
      aggregate: vi.fn().mockReturnThis(),
      aggregatePaginate: vi.fn(),
      create: vi.fn(),
      findByIdAndDelete: vi.fn().mockImplementation(() => chainable(null)),
      findByIdAndUpdate: vi.fn().mockImplementation(() => chainable(null)),
      findOne: vi.fn().mockImplementation(() => chainable(null)),
    };

    mockLogger = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    const mockConfigService = {
      get: vi.fn(),
      isProduction: false,
    };

    const mockRedisClient = {
      del: vi.fn().mockResolvedValue(1),
      expire: vi.fn().mockResolvedValue(1),
      get: vi.fn().mockResolvedValue(null),
      incr: vi.fn().mockResolvedValue(1),
      set: vi.fn().mockResolvedValue('OK'),
      ttl: vi.fn().mockResolvedValue(-1),
      zAdd: vi.fn().mockResolvedValue(1),
      zCard: vi.fn().mockResolvedValue(0),
      zRemRangeByScore: vi.fn().mockResolvedValue(0),
    };

    const mockRedisService = {
      del: vi.fn(),
      get: vi.fn().mockResolvedValue(null),
      getPublisher: vi.fn().mockReturnValue(mockRedisClient),
      incr: vi.fn().mockResolvedValue(1),
      set: vi.fn(),
      ttl: vi.fn().mockResolvedValue(-1),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiKeysService,
        {
          provide: getModelToken(ApiKey.name, DB_CONNECTIONS.AUTH),
          useValue: mockModel,
        },
        {
          provide: LoggerService,
          useValue: mockLogger,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
      ],
    }).compile();

    service = module.get<ApiKeysService>(ApiKeysService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateApiKey', () => {
    it('should generate API key with test prefix in non-production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const apiKey = service.generateApiKey();

      expect(apiKey).toMatch(/^gf_test_/);
      expect(apiKey.length).toBeGreaterThan(20);

      process.env.NODE_ENV = originalEnv;
    });

    it('should generate API key with live prefix in production', () => {
      // The service uses configService.isProduction, so we need to mock it
      Object.defineProperty(service.configService, 'isProduction', {
        configurable: true,
        get: () => true,
      });

      const apiKey = service.generateApiKey();

      expect(apiKey).toMatch(/^gf_live_/);
      expect(apiKey.length).toBeGreaterThan(20);

      // Reset
      Object.defineProperty(service.configService, 'isProduction', {
        configurable: true,
        get: () => false,
      });
    });
  });

  describe('hashApiKey', () => {
    it('should hash API key', async () => {
      const plainKey = 'test_api_key';
      const hashedKey = await service.hashApiKey(plainKey);

      expect(hashedKey).toBeDefined();
      expect(hashedKey).not.toBe(plainKey);
      expect(hashedKey.length).toBeGreaterThan(20);
    });
  });

  describe('verifyApiKey', () => {
    it('should verify correct API key', async () => {
      const plainKey = 'test_api_key';
      const hashedKey = await service.hashApiKey(plainKey);

      const isValid = await service.verifyApiKey(plainKey, hashedKey);

      expect(isValid).toBe(true);
    });

    it('should reject incorrect API key', async () => {
      const plainKey = 'test_api_key';
      const wrongKey = 'wrong_api_key';
      const hashedKey = await service.hashApiKey(plainKey);

      const isValid = await service.verifyApiKey(wrongKey, hashedKey);

      expect(isValid).toBe(false);
    });
  });

  describe('computeFingerprint', () => {
    it('should return a hex SHA-256 hash of the first 16 chars', () => {
      const key = 'gf_test_abcdefghijklmnopqrstuvwxyz';
      const fp = service.computeFingerprint(key);

      expect(fp).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should return the same fingerprint for keys sharing the first 16 chars', () => {
      const fp1 = service.computeFingerprint('gf_test_abcdefghAAAA');
      const fp2 = service.computeFingerprint('gf_test_abcdefghBBBB');

      expect(fp1).toBe(fp2);
    });

    it('should return different fingerprints for different prefixes', () => {
      const fp1 = service.computeFingerprint('gf_test_aaaaaaaa');
      const fp2 = service.computeFingerprint('gf_test_bbbbbbbb');

      expect(fp1).not.toBe(fp2);
    });
  });

  describe('createWithKey', () => {
    it('should create API key with generated key and fingerprint', async () => {
      const createDto: CreateApiKeyDto & {
        user: Types.ObjectId;
        organization: Types.ObjectId;
      } = {
        category: ApiKeyCategory.GENFEEDAI,
        description: 'A test API key',
        label: 'Test API Key',
        organization: new Types.ObjectId('507f1f77bcf86cd799439013'),
        rateLimit: 100,
        scopes: ['videos:create'],
        user: new Types.ObjectId('507f1f77bcf86cd799439012'),
      };

      // Mock the base `create` method directly on the service
      const createSpy = vi
        .spyOn(service, 'create' as any)
        .mockResolvedValue(mockApiKey);

      const result = await service.createWithKey(createDto);

      expect(result).toHaveProperty('apiKey');
      expect(result).toHaveProperty('plainKey');
      expect(result.apiKey).toEqual(mockApiKey);
      expect(result.plainKey).toMatch(/^gf_(test|live)_/);
      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          category: createDto.category,
          isRevoked: false,
          keyFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
          label: createDto.label,
          rateLimit: createDto.rateLimit,
          scopes: createDto.scopes,
          usageCount: 0,
        }),
      );
    });

    it('should create API key with default scopes', async () => {
      const createDto: CreateApiKeyDto & {
        user: Types.ObjectId;
        organization: Types.ObjectId;
      } = {
        category: ApiKeyCategory.GENFEEDAI,
        label: 'Test API Key',
        organization: new Types.ObjectId('507f1f77bcf86cd799439013'),
        user: new Types.ObjectId('507f1f77bcf86cd799439012'),
      };

      const createSpy = vi
        .spyOn(service, 'create' as any)
        .mockResolvedValue(mockApiKey);

      await service.createWithKey(createDto);

      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          scopes: [
            'videos:create',
            'videos:read',
            'images:create',
            'images:read',
            'analytics:read',
          ],
        }),
      );
    });

    it('should create API key with default rate limit', async () => {
      const createDto: CreateApiKeyDto & {
        user: Types.ObjectId;
        organization: Types.ObjectId;
      } = {
        category: ApiKeyCategory.GENFEEDAI,
        label: 'Test API Key',
        organization: new Types.ObjectId('507f1f77bcf86cd799439013'),
        user: new Types.ObjectId('507f1f77bcf86cd799439012'),
      };

      const createSpy = vi
        .spyOn(service, 'create' as any)
        .mockResolvedValue(mockApiKey);

      await service.createWithKey(createDto);

      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          rateLimit: 60,
        }),
      );
    });
  });

  describe('findByKey', () => {
    it('should find API key via fingerprint (fast path)', async () => {
      const plainKey = 'test_api_key_1234';
      const hashedKey = await service.hashApiKey(plainKey);
      const mockApiKeyWithHash = cloneApiKey({ key: hashedKey });

      const findAllSpy = vi
        .spyOn(service, 'findAll' as any)
        .mockResolvedValueOnce({ docs: [mockApiKeyWithHash] });
      vi.spyOn(service, 'updateLastUsed' as any).mockResolvedValue(undefined);

      const result = await service.findByKey(plainKey);

      expect(result).toEqual(mockApiKeyWithHash);
      // Should only call findAll once (fingerprint query hit)
      expect(findAllSpy).toHaveBeenCalledTimes(1);
      expect(findAllSpy).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            $match: expect.objectContaining({
              keyFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
            }),
          }),
        ]),
        expect.anything(),
      );
    });

    it('should fall back to legacy scan when no fingerprint match', async () => {
      const plainKey = 'test_api_key_legacy';
      const hashedKey = await service.hashApiKey(plainKey);
      const mockLegacyKey = cloneApiKey({ key: hashedKey });

      const findAllSpy = vi
        .spyOn(service, 'findAll' as any)
        .mockResolvedValueOnce({ docs: [] }) // fingerprint miss
        .mockResolvedValueOnce({ docs: [mockLegacyKey] }); // legacy scan
      vi.spyOn(service, 'updateLastUsed' as any).mockResolvedValue(undefined);
      vi.spyOn(service, 'patchAll' as any).mockResolvedValue(undefined);

      const result = await service.findByKey(plainKey);

      expect(result).toEqual(mockLegacyKey);
      expect(findAllSpy).toHaveBeenCalledTimes(2);
    });

    it('should backfill fingerprint on legacy key match', async () => {
      const plainKey = 'test_api_key_backfill';
      const hashedKey = await service.hashApiKey(plainKey);
      const mockLegacyKey = cloneApiKey({ key: hashedKey });

      vi.spyOn(service, 'findAll' as any)
        .mockResolvedValueOnce({ docs: [] })
        .mockResolvedValueOnce({ docs: [mockLegacyKey] });
      vi.spyOn(service, 'updateLastUsed' as any).mockResolvedValue(undefined);
      const patchAllSpy = vi
        .spyOn(service, 'patchAll' as any)
        .mockResolvedValue(undefined);

      await service.findByKey(plainKey);

      expect(patchAllSpy).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          $set: { keyFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/) },
        }),
      );
    });

    it('should return null for invalid key', async () => {
      const plainKey = 'invalid_key';

      vi.spyOn(service, 'findAll' as any)
        .mockResolvedValueOnce({ docs: [] })
        .mockResolvedValueOnce({ docs: [] });

      const result = await service.findByKey(plainKey);

      expect(result).toBeNull();
    });

    it('should return null for revoked key', async () => {
      const plainKey = 'test_api_key';
      vi.spyOn(service, 'findAll' as any)
        .mockResolvedValueOnce({ docs: [] })
        .mockResolvedValueOnce({ docs: [] });

      const result = await service.findByKey(plainKey);

      expect(result).toBeNull();
    });
  });

  describe('updateLastUsed', () => {
    it('should update last used timestamp and increment usage count', async () => {
      const keyId = '507f1f77bcf86cd799439011';
      const ip = '192.168.1.1';

      // updateLastUsed uses patchAll (base service method)
      const patchAllSpy = vi
        .spyOn(service, 'patchAll' as any)
        .mockResolvedValue(undefined);

      await service.updateLastUsed(keyId, ip);

      expect(patchAllSpy).toHaveBeenCalledWith(
        { _id: expect.any(Types.ObjectId) },
        expect.objectContaining({
          $inc: { usageCount: 1 },
          $set: expect.objectContaining({
            lastUsedAt: expect.any(Date),
            lastUsedIp: ip,
          }),
        }),
      );
    });
  });

  describe('revoke', () => {
    it('should revoke API key', async () => {
      const keyId = '507f1f77bcf86cd799439011';
      const revokedKey = cloneApiKey({ isRevoked: true });

      // revoke calls this.patch() from the base service
      const patchSpy = vi
        .spyOn(service, 'patch' as any)
        .mockResolvedValue(revokedKey);

      const result = await service.revoke(keyId);

      expect(result).toEqual(revokedKey);
      expect(patchSpy).toHaveBeenCalledWith(
        keyId,
        expect.objectContaining({
          isRevoked: true,
          revokedAt: expect.any(Date),
        }),
      );
    });
  });

  describe('hasScope', () => {
    it('should return true for matching scope', () => {
      const apiKey = cloneApiKey({ scopes: ['videos:create'] });

      const result = service.hasScope(apiKey, 'videos:create');

      expect(result).toBe(true);
    });

    it('should return true for wildcard scope', () => {
      const apiKey = cloneApiKey({ scopes: ['*'] });

      const result = service.hasScope(apiKey, 'videos:create');

      expect(result).toBe(true);
    });

    it('should return false for non-matching scope', () => {
      const apiKey = cloneApiKey({ scopes: ['videos:create'] });

      const result = service.hasScope(apiKey, 'images:create');

      expect(result).toBe(false);
    });
  });

  describe('isIpAllowed', () => {
    it('should return true when no IP restriction', () => {
      const apiKey = cloneApiKey({ allowedIps: [] });

      const result = service.isIpAllowed(apiKey, '192.168.1.1');

      expect(result).toBe(true);
    });

    it('should return true for allowed IP', () => {
      const apiKey = cloneApiKey({
        allowedIps: ['192.168.1.1', '192.168.1.2'],
      });

      const result = service.isIpAllowed(apiKey, '192.168.1.1');

      expect(result).toBe(true);
    });

    it('should return false for disallowed IP', () => {
      const apiKey = cloneApiKey({ allowedIps: ['192.168.1.1'] });

      const result = service.isIpAllowed(apiKey, '192.168.1.2');

      expect(result).toBe(false);
    });
  });

  describe('checkRateLimit', () => {
    it('should return true when no rate limit', async () => {
      const apiKey = cloneApiKey({ rateLimit: undefined });

      const result = await service.checkRateLimit(apiKey);

      expect(result).toBe(true);
    });

    it('should return true when rate limit is set', async () => {
      const apiKey = cloneApiKey({ rateLimit: 60 });

      const result = await service.checkRateLimit(apiKey);

      expect(result).toBe(true);
    });
  });
});
