vi.mock('@api/shared/utils/telegram-auth/telegram-auth.util', () => ({
  TelegramAuthUtil: {
    hasRequiredFields: vi.fn(),
    isAuthDateValid: vi.fn(),
    verifyAuthData: vi.fn(),
  },
}));

import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import {
  TelegramAuthData,
  TelegramService,
} from '@api/services/integrations/telegram/services/telegram.service';
import { TelegramAuthUtil } from '@api/shared/utils/telegram-auth/telegram-auth.util';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpException, HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

describe('TelegramService', () => {
  let service: TelegramService;

  const mockCredentialsService = {
    connectAccount: vi.fn(),
    create: vi.fn(),
    createPendingForBrand: vi.fn(),
    findOne: vi.fn(),
    patch: vi.fn(),
  };

  const mockLoggerService = {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  const validAuthData: TelegramAuthData = {
    auth_date: Math.floor(Date.now() / 1000),
    first_name: 'John',
    hash: 'valid-hash',
    id: 123456,
    last_name: 'Doe',
    photo_url: 'https://t.me/photo.jpg',
    username: 'johndoe',
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelegramService,
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn((key: string) =>
              key === 'TELEGRAM_BOT_TOKEN' ? 'test-bot-token' : undefined,
            ),
          },
        },
        {
          provide: CredentialsService,
          useValue: mockCredentialsService,
        },
        {
          provide: LoggerService,
          useValue: mockLoggerService,
        },
      ],
    }).compile();

    service = module.get<TelegramService>(TelegramService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('verifyAndSaveAuth', () => {
    const orgId = 'test-object-id';
    const brandId = 'test-object-id';
    const userId = 'test-object-id';

    it('should verify auth data and create new credential', async () => {
      vi.mocked(TelegramAuthUtil.hasRequiredFields).mockReturnValue(true);
      vi.mocked(TelegramAuthUtil.isAuthDateValid).mockReturnValue(true);
      vi.mocked(TelegramAuthUtil.verifyAuthData).mockReturnValue(true);
      mockCredentialsService.createPendingForBrand.mockResolvedValue({
        id: 'pending-credential-id',
      });
      const newCredential = { id: 'test-object-id', isConnected: true };
      mockCredentialsService.connectAccount.mockResolvedValue(newCredential);

      const result = await service.verifyAndSaveAuth(
        orgId,
        brandId,
        userId,
        validAuthData,
      );

      expect(result).toEqual(newCredential);
      expect(mockCredentialsService.connectAccount).toHaveBeenCalledWith(
        'pending-credential-id',
        orgId,
        expect.objectContaining({
          handle: 'johndoe',
          id: '123456',
        }),
        expect.objectContaining({
          isConnected: true,
        }),
      );
    });

    it('should update existing credential if one exists', async () => {
      vi.mocked(TelegramAuthUtil.hasRequiredFields).mockReturnValue(true);
      vi.mocked(TelegramAuthUtil.isAuthDateValid).mockReturnValue(true);
      vi.mocked(TelegramAuthUtil.verifyAuthData).mockReturnValue(true);
      const existingId = 'test-object-id';
      mockCredentialsService.createPendingForBrand.mockResolvedValue({
        id: 'pending-credential-id',
      });
      const updated = { id: existingId, isConnected: true };
      mockCredentialsService.connectAccount.mockResolvedValue(updated);

      const result = await service.verifyAndSaveAuth(
        orgId,
        brandId,
        userId,
        validAuthData,
      );

      expect(result).toEqual(updated);
      expect(mockCredentialsService.connectAccount).toHaveBeenCalledWith(
        'pending-credential-id',
        orgId,
        expect.objectContaining({ id: '123456' }),
        expect.objectContaining({ isConnected: true }),
      );
    });

    it('should throw BAD_REQUEST when required fields are missing', async () => {
      vi.mocked(TelegramAuthUtil.hasRequiredFields).mockReturnValue(false);

      await expect(
        service.verifyAndSaveAuth(orgId, brandId, userId, validAuthData),
      ).rejects.toThrow(HttpException);

      try {
        await service.verifyAndSaveAuth(orgId, brandId, userId, validAuthData);
      } catch (e) {
        expect((e as HttpException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
      }
    });

    it('should throw BAD_REQUEST when auth date is expired', async () => {
      vi.mocked(TelegramAuthUtil.hasRequiredFields).mockReturnValue(true);
      vi.mocked(TelegramAuthUtil.isAuthDateValid).mockReturnValue(false);

      await expect(
        service.verifyAndSaveAuth(orgId, brandId, userId, validAuthData),
      ).rejects.toThrow(HttpException);
    });

    it('should throw UNAUTHORIZED when HMAC signature is invalid', async () => {
      vi.mocked(TelegramAuthUtil.hasRequiredFields).mockReturnValue(true);
      vi.mocked(TelegramAuthUtil.isAuthDateValid).mockReturnValue(true);
      vi.mocked(TelegramAuthUtil.verifyAuthData).mockReturnValue(false);

      await expect(
        service.verifyAndSaveAuth(orgId, brandId, userId, validAuthData),
      ).rejects.toThrow(HttpException);

      try {
        await service.verifyAndSaveAuth(orgId, brandId, userId, validAuthData);
      } catch (e) {
        expect((e as HttpException).getStatus()).toBe(HttpStatus.UNAUTHORIZED);
      }
    });

    it('should build externalName from first_name and last_name when username exists', async () => {
      vi.mocked(TelegramAuthUtil.hasRequiredFields).mockReturnValue(true);
      vi.mocked(TelegramAuthUtil.isAuthDateValid).mockReturnValue(true);
      vi.mocked(TelegramAuthUtil.verifyAuthData).mockReturnValue(true);
      mockCredentialsService.createPendingForBrand.mockResolvedValue({
        id: 'pending-credential-id',
      });
      mockCredentialsService.connectAccount.mockResolvedValue({ id: 'new' });

      await service.verifyAndSaveAuth(orgId, brandId, userId, validAuthData);

      expect(mockCredentialsService.connectAccount).toHaveBeenCalledWith(
        'pending-credential-id',
        orgId,
        expect.objectContaining({
          name: 'John Doe',
        }),
        expect.any(Object),
      );
    });

    it('should wrap unexpected errors in INTERNAL_SERVER_ERROR', async () => {
      vi.mocked(TelegramAuthUtil.hasRequiredFields).mockReturnValue(true);
      vi.mocked(TelegramAuthUtil.isAuthDateValid).mockReturnValue(true);
      vi.mocked(TelegramAuthUtil.verifyAuthData).mockReturnValue(true);
      mockCredentialsService.createPendingForBrand.mockRejectedValue(
        new Error('DB connection lost'),
      );

      await expect(
        service.verifyAndSaveAuth(orgId, brandId, userId, validAuthData),
      ).rejects.toThrow(HttpException);

      try {
        await service.verifyAndSaveAuth(orgId, brandId, userId, validAuthData);
      } catch (e) {
        expect((e as HttpException).getStatus()).toBe(
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
    });
  });
});
