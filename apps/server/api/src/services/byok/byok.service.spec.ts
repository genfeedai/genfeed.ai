import { OrganizationSetting } from '@api/collections/organization-settings/schemas/organization-setting.schema';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { ByokService } from '@api/services/byok/byok.service';
import { EncryptionUtil } from '@api/shared/utils/encryption/encryption.util';
import { ByokBillingStatus, ByokProvider } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { of, throwError } from 'rxjs';

// Mock EncryptionUtil so we don't need real crypto keys
vi.mock('@api/shared/utils/encryption/encryption.util', () => ({
  EncryptionUtil: {
    decrypt: vi.fn((v: string) => `decrypted_${v}`),
    encrypt: vi.fn((v: string) => `encrypted_${v}`),
  },
}));

vi.mock('@api/helpers/utils/jwt/jwt.util', () => ({
  encodeJwtToken: vi.fn(() => 'mock-jwt-token'),
}));

describe('ByokService', () => {
  let service: ByokService;
  let orgSettingsService: {
    findOne: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
  };
  let orgSettingsModel: {
    findOne: ReturnType<typeof vi.fn>;
    findOneAndUpdate: ReturnType<typeof vi.fn>;
  };
  let httpService: {
    get: ReturnType<typeof vi.fn>;
    post: ReturnType<typeof vi.fn>;
  };
  let loggerService: {
    debug: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    orgSettingsService = { findOne: vi.fn(), patch: vi.fn() };
    orgSettingsModel = { findOne: vi.fn(), findOneAndUpdate: vi.fn() };
    httpService = { get: vi.fn(), post: vi.fn() };
    loggerService = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ByokService,
        {
          provide: getModelToken(OrganizationSetting.name, DB_CONNECTIONS.AUTH),
          useValue: orgSettingsModel,
        },
        {
          provide: OrganizationSettingsService,
          useValue: orgSettingsService,
        },
        { provide: LoggerService, useValue: loggerService },
        { provide: HttpService, useValue: httpService },
      ],
    }).compile();

    service = module.get<ByokService>(ByokService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('resolveApiKey', () => {
    it('returns undefined when no org settings exist', async () => {
      orgSettingsService.findOne.mockResolvedValue(null);

      const result = await service.resolveApiKey('org-1', ByokProvider.OPENAI);

      expect(result).toBeUndefined();
    });

    it('returns undefined when provider key is not enabled', async () => {
      const settingsDoc = {
        byokKeys: new Map([
          [
            ByokProvider.OPENAI,
            {
              apiKey: 'enc-key',
              isEnabled: false,
              provider: ByokProvider.OPENAI,
            },
          ],
        ]),
      };
      orgSettingsService.findOne.mockResolvedValue(settingsDoc);

      const result = await service.resolveApiKey('org-1', ByokProvider.OPENAI);

      expect(result).toBeUndefined();
    });

    it('returns decrypted key and secret when enabled', async () => {
      const settingsDoc = {
        byokKeys: new Map([
          [
            ByokProvider.KLINGAI,
            {
              apiKey: 'enc-key',
              apiSecret: 'enc-secret',
              isEnabled: true,
              provider: ByokProvider.KLINGAI,
            },
          ],
        ]),
      };
      orgSettingsService.findOne.mockResolvedValue(settingsDoc);

      const result = await service.resolveApiKey('org-1', ByokProvider.KLINGAI);

      expect(result).toEqual({
        apiKey: 'decrypted_enc-key',
        apiSecret: 'decrypted_enc-secret',
      });
      expect(EncryptionUtil.decrypt).toHaveBeenCalledWith('enc-key');
      expect(EncryptionUtil.decrypt).toHaveBeenCalledWith('enc-secret');
    });

    it('returns undefined and logs error on failure', async () => {
      orgSettingsService.findOne.mockRejectedValue(new Error('db error'));

      const result = await service.resolveApiKey('org-1', ByokProvider.OPENAI);

      expect(result).toBeUndefined();
      expect(loggerService.error).toHaveBeenCalled();
    });
  });

  describe('isByokActiveForProvider', () => {
    it('returns true when key resolves successfully', async () => {
      const settingsDoc = {
        byokKeys: new Map([
          [
            ByokProvider.OPENAI,
            {
              apiKey: 'enc-key',
              isEnabled: true,
              provider: ByokProvider.OPENAI,
            },
          ],
        ]),
      };
      orgSettingsService.findOne.mockResolvedValue(settingsDoc);

      expect(
        await service.isByokActiveForProvider('org-1', ByokProvider.OPENAI),
      ).toBe(true);
    });

    it('returns false when no key exists', async () => {
      orgSettingsService.findOne.mockResolvedValue(null);

      expect(
        await service.isByokActiveForProvider('org-1', ByokProvider.OPENAI),
      ).toBe(false);
    });
  });

  describe('isByokBillingInGoodStanding', () => {
    it('returns true when no org settings exist', async () => {
      orgSettingsService.findOne.mockResolvedValue(null);
      expect(
        await service.isByokBillingInGoodStanding('67a000000000000000000001'),
      ).toBe(true);
    });

    it('returns true when status is ACTIVE', async () => {
      orgSettingsService.findOne.mockResolvedValue({
        byokBillingStatus: ByokBillingStatus.ACTIVE,
      });
      expect(
        await service.isByokBillingInGoodStanding('67a000000000000000000001'),
      ).toBe(true);
    });

    it('returns false when status is SUSPENDED', async () => {
      orgSettingsService.findOne.mockResolvedValue({
        byokBillingStatus: ByokBillingStatus.SUSPENDED,
      });
      expect(
        await service.isByokBillingInGoodStanding('67a000000000000000000001'),
      ).toBe(false);
    });

    it('returns true when status is undefined (no billing configured)', async () => {
      orgSettingsService.findOne.mockResolvedValue({
        byokBillingStatus: undefined,
      });
      expect(
        await service.isByokBillingInGoodStanding('67a000000000000000000001'),
      ).toBe(true);
    });
  });

  describe('saveKey', () => {
    it('encrypts and saves key to organization settings', async () => {
      orgSettingsModel.findOneAndUpdate.mockResolvedValue({});

      await service.saveKey(
        '67a000000000000000000001',
        ByokProvider.OPENAI,
        'sk-real-key',
      );

      expect(EncryptionUtil.encrypt).toHaveBeenCalledWith('sk-real-key');
      expect(orgSettingsModel.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ organization: expect.anything() }),
        expect.objectContaining({
          $set: expect.objectContaining({
            isByokEnabled: true,
          }),
        }),
        { returnDocument: 'after' },
      );
      expect(loggerService.log).toHaveBeenCalled();
    });

    it('encrypts apiSecret when provided', async () => {
      orgSettingsModel.findOneAndUpdate.mockResolvedValue({});

      await service.saveKey(
        '67a000000000000000000001',
        ByokProvider.KLINGAI,
        'access-key',
        'secret-key',
      );

      expect(EncryptionUtil.encrypt).toHaveBeenCalledWith('access-key');
      expect(EncryptionUtil.encrypt).toHaveBeenCalledWith('secret-key');
    });

    it('throws and logs error on db failure', async () => {
      orgSettingsModel.findOneAndUpdate.mockRejectedValue(
        new Error('db write error'),
      );

      await expect(
        service.saveKey('67a000000000000000000001', ByokProvider.OPENAI, 'key'),
      ).rejects.toThrow('db write error');
      expect(loggerService.error).toHaveBeenCalled();
    });
  });

  describe('removeKey', () => {
    it('removes key and disables BYOK when no keys remain', async () => {
      orgSettingsModel.findOneAndUpdate
        .mockResolvedValueOnce({ byokKeys: new Map() })
        .mockResolvedValueOnce({});

      await service.removeKey('67a000000000000000000001', ByokProvider.OPENAI);

      expect(orgSettingsModel.findOneAndUpdate).toHaveBeenCalledTimes(2);
      expect(loggerService.log).toHaveBeenCalled();
    });

    it('keeps BYOK enabled when other keys remain', async () => {
      orgSettingsModel.findOneAndUpdate.mockResolvedValueOnce({
        byokKeys: new Map([[ByokProvider.FAL, { apiKey: 'enc' }]]),
      });

      await service.removeKey('67a000000000000000000001', ByokProvider.OPENAI);

      // Only called once — no second call to disable
      expect(orgSettingsModel.findOneAndUpdate).toHaveBeenCalledTimes(1);
    });
  });

  describe('incrementUsage', () => {
    it('atomically increments totalRequests and updates lastUsedAt', async () => {
      orgSettingsModel.findOneAndUpdate.mockResolvedValue({});

      await service.incrementUsage(
        '67a000000000000000000001',
        ByokProvider.OPENAI,
      );

      expect(orgSettingsModel.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ organization: expect.anything() }),
        expect.objectContaining({
          $inc: { [`byokKeys.${ByokProvider.OPENAI}.totalRequests`]: 1 },
        }),
      );
    });

    it('logs error but does not throw on failure', async () => {
      orgSettingsModel.findOneAndUpdate.mockRejectedValue(
        new Error('db error'),
      );

      // Should not throw
      await service.incrementUsage(
        '67a000000000000000000001',
        ByokProvider.OPENAI,
      );

      expect(loggerService.error).toHaveBeenCalled();
    });
  });

  describe('validateKey', () => {
    it('validates Anthropic key with correct API call', async () => {
      httpService.get.mockReturnValue(of({ data: {} }));

      const result = await service.validateKey(
        ByokProvider.ANTHROPIC,
        'sk-ant-test',
      );

      expect(result).toEqual({ isValid: true });
      expect(httpService.get).toHaveBeenCalledWith(
        'https://api.anthropic.com/v1/models',
        expect.objectContaining({
          headers: expect.objectContaining({ 'x-api-key': 'sk-ant-test' }),
        }),
      );
    });

    it('returns invalid when API call fails', async () => {
      httpService.get.mockReturnValue(throwError(() => new Error('401')));

      const result = await service.validateKey(ByokProvider.OPENAI, 'bad-key');

      expect(result.isValid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('validates Kling AI requires both key and secret', async () => {
      const result = await service.validateKey(
        ByokProvider.KLINGAI,
        'key-only',
      );

      expect(result).toEqual({
        error: 'Kling AI requires both API key and secret',
        isValid: false,
      });
    });

    it('returns error for unsupported provider', async () => {
      const result = await service.validateKey(
        'unknown' as ByokProvider,
        'key',
      );

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Unsupported provider');
    });
  });

  describe('getStatus', () => {
    it('returns status for all providers with masked keys', async () => {
      const settingsDoc = {
        byokKeys: new Map([
          [
            ByokProvider.OPENAI,
            {
              apiKey: 'enc-key',
              isEnabled: true,
              lastUsedAt: new Date('2024-06-01'),
              lastValidatedAt: new Date('2024-05-01'),
              provider: ByokProvider.OPENAI,
              totalRequests: 42,
            },
          ],
        ]),
      };
      orgSettingsService.findOne.mockResolvedValue(settingsDoc);

      const result = await service.getStatus('org-1');

      expect(result.length).toBe(Object.values(ByokProvider).length);

      const openaiStatus = result.find(
        (s) => s.provider === ByokProvider.OPENAI,
      );
      expect(openaiStatus?.hasKey).toBe(true);
      expect(openaiStatus?.isEnabled).toBe(true);
      expect(openaiStatus?.totalRequests).toBe(42);
      expect(openaiStatus?.maskedKey).toBeDefined();
      // Masked key should not be the full decrypted value
      expect(openaiStatus?.maskedKey).toContain('*');
    });

    it('returns status with no keys when org has no settings', async () => {
      orgSettingsService.findOne.mockResolvedValue(null);

      const result = await service.getStatus('org-1');

      const allDisabled = result.every((s) => !s.hasKey && !s.isEnabled);
      expect(allDisabled).toBe(true);
    });
  });
});
