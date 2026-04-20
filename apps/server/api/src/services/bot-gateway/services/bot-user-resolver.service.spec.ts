import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { BotUserResolverService } from '@api/services/bot-gateway/services/bot-user-resolver.service';
import { CredentialPlatform } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';

const mockCredential = (overrides: Record<string, unknown> = {}) => ({
  _id: 'test-object-id',
  brand: 'test-object-id',
  organization: 'test-object-id',
  user: 'test-object-id',
  ...overrides,
});

describe('BotUserResolverService', () => {
  let service: BotUserResolverService;
  let credentialsService: vi.Mocked<Pick<CredentialsService, 'findOne'>>;
  let brandsService: vi.Mocked<Pick<BrandsService, 'findOne' | 'find'>>;
  let loggerService: vi.Mocked<Pick<LoggerService, 'log' | 'warn' | 'error'>>;

  const platform = CredentialPlatform.TELEGRAM;
  const platformUserId = 'tg-user-99';

  beforeEach(async () => {
    credentialsService = { findOne: vi.fn() };
    brandsService = { find: vi.fn(), findOne: vi.fn() };
    loggerService = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BotUserResolverService,
        { provide: CredentialsService, useValue: credentialsService },
        { provide: BrandsService, useValue: brandsService },
        { provide: LoggerService, useValue: loggerService },
      ],
    }).compile();

    service = module.get<BotUserResolverService>(BotUserResolverService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ──────────────────────────── resolveUser ────────────────────────────

  describe('resolveUser', () => {
    it('returns null when no credential found', async () => {
      credentialsService.findOne.mockResolvedValue(null);
      const result = await service.resolveUser(platform, platformUserId);
      expect(result).toBeNull();
    });

    it('queries credentials with correct filter', async () => {
      credentialsService.findOne.mockResolvedValue(null);
      await service.resolveUser(platform, platformUserId);
      expect(credentialsService.findOne).toHaveBeenCalledWith({
        externalId: platformUserId,
        isConnected: true,
        isDeleted: false,
        platform,
      });
    });

    it('returns resolved user object on success', async () => {
      const cred = mockCredential();
      credentialsService.findOne.mockResolvedValue(cred as never);
      const result = await service.resolveUser(platform, platformUserId);
      expect(result).toEqual({
        brandId: cred.brand.toString(),
        credentialId: cred._id.toString(),
        organizationId: cred.organization.toString(),
        userId: cred.user.toString(),
      });
    });

    it('returns null and does not throw on service error', async () => {
      credentialsService.findOne.mockRejectedValue(new Error('DB error'));
      const result = await service.resolveUser(platform, platformUserId);
      expect(result).toBeNull();
    });

    it('logs error on exception', async () => {
      credentialsService.findOne.mockRejectedValue(new Error('timeout'));
      await service.resolveUser(platform, platformUserId);
      expect(loggerService.error).toHaveBeenCalled();
    });
  });

  // ───────────────────────── resolveUserWithBrand ──────────────────────

  describe('resolveUserWithBrand', () => {
    it('returns null when base resolveUser returns null', async () => {
      credentialsService.findOne.mockResolvedValue(null);
      const result = await service.resolveUserWithBrand(
        platform,
        platformUserId,
        'MyBrand',
      );
      expect(result).toBeNull();
    });

    it('returns original resolved user when no brandName provided', async () => {
      const cred = mockCredential();
      credentialsService.findOne.mockResolvedValue(cred as never);
      const result = await service.resolveUserWithBrand(
        platform,
        platformUserId,
      );
      expect(result?.credentialId).toBe(cred._id.toString());
    });

    it('switches brandId when brand found by name', async () => {
      const cred = mockCredential();
      credentialsService.findOne.mockResolvedValue(cred as never);
      const brandId = 'test-object-id';
      brandsService.findOne.mockResolvedValue({
        _id: brandId,
        label: 'MyBrand',
      } as never);

      const result = await service.resolveUserWithBrand(
        platform,
        platformUserId,
        'MyBrand',
      );
      expect(result?.brandId).toBe(brandId.toString());
    });

    it('returns original user when brand not found', async () => {
      const cred = mockCredential();
      credentialsService.findOne.mockResolvedValue(cred as never);
      brandsService.findOne.mockResolvedValue(null);

      const result = await service.resolveUserWithBrand(
        platform,
        platformUserId,
        'UnknownBrand',
      );
      expect(result?.brandId).toBe(cred.brand.toString());
    });

    it('returns original user on brand lookup error', async () => {
      const cred = mockCredential();
      credentialsService.findOne.mockResolvedValue(cred as never);
      brandsService.findOne.mockRejectedValue(new Error('DB down'));

      const result = await service.resolveUserWithBrand(
        platform,
        platformUserId,
        'AnyBrand',
      );
      expect(result?.credentialId).toBe(cred._id.toString());
    });
  });

  // ─────────────────────────── getUserBrands ───────────────────────────

  describe('getUserBrands', () => {
    it('returns mapped brand list', async () => {
      const brandA = { _id: 'test-object-id', label: 'Alpha' };
      const brandB = { _id: 'test-object-id', label: 'Beta' };
      brandsService.find.mockResolvedValue([brandA, brandB] as never);

      const result = await service.getUserBrands('test-object-id');
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ id: brandA._id.toString(), name: 'Alpha' });
    });

    it('returns empty array on error', async () => {
      brandsService.find.mockRejectedValue(new Error('fail'));
      const result = await service.getUserBrands('test-object-id');
      expect(result).toEqual([]);
    });
  });
});
