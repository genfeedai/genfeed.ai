vi.mock('@api/shared/utils/telegram-auth/telegram-auth.util', () => ({
  TelegramAuthUtil: {
    hasRequiredFields: vi.fn(),
    isAuthDateValid: vi.fn(),
    verifyAuthData: vi.fn(),
  },
}));

import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { ConfigService } from '@api/config/config.service';
import {
  TelegramAuthData,
  TelegramService,
} from '@api/services/integrations/telegram/services/telegram.service';
import { TelegramAuthUtil } from '@api/shared/utils/telegram-auth/telegram-auth.util';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpException, HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

describe('TelegramService', () => {
  let service: TelegramService;
  let credentialsService: CredentialsService;

  const mockCredentialsService = {
    create: vi.fn(),
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
    credentialsService = module.get<CredentialsService>(CredentialsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('verifyAndSaveAuth', () => {
    const orgId = new Types.ObjectId().toString();
    const brandId = new Types.ObjectId().toString();
    const userId = new Types.ObjectId().toString();

    it('should verify auth data and create new credential', async () => {
      vi.mocked(TelegramAuthUtil.hasRequiredFields).mockReturnValue(true);
      vi.mocked(TelegramAuthUtil.isAuthDateValid).mockReturnValue(true);
      vi.mocked(TelegramAuthUtil.verifyAuthData).mockReturnValue(true);
      mockCredentialsService.findOne.mockResolvedValue(null);
      const newCredential = { _id: new Types.ObjectId(), isConnected: true };
      mockCredentialsService.create.mockResolvedValue(newCredential);

      const result = await service.verifyAndSaveAuth(
        orgId,
        brandId,
        userId,
        validAuthData,
      );

      expect(result).toEqual(newCredential);
      expect(mockCredentialsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          externalHandle: 'johndoe',
          externalId: '123456',
          isConnected: true,
        }),
      );
    });

    it('should update existing credential if one exists', async () => {
      vi.mocked(TelegramAuthUtil.hasRequiredFields).mockReturnValue(true);
      vi.mocked(TelegramAuthUtil.isAuthDateValid).mockReturnValue(true);
      vi.mocked(TelegramAuthUtil.verifyAuthData).mockReturnValue(true);
      const existingId = new Types.ObjectId();
      mockCredentialsService.findOne.mockResolvedValue({
        _id: existingId,
      });
      const updated = { _id: existingId, isConnected: true };
      mockCredentialsService.patch.mockResolvedValue(updated);

      const result = await service.verifyAndSaveAuth(
        orgId,
        brandId,
        userId,
        validAuthData,
      );

      expect(result).toEqual(updated);
      expect(mockCredentialsService.patch).toHaveBeenCalledWith(
        existingId,
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
      mockCredentialsService.findOne.mockResolvedValue(null);
      mockCredentialsService.create.mockResolvedValue({ _id: 'new' });

      await service.verifyAndSaveAuth(orgId, brandId, userId, validAuthData);

      expect(mockCredentialsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          externalName: 'John Doe',
        }),
      );
    });

    it('should wrap unexpected errors in INTERNAL_SERVER_ERROR', async () => {
      vi.mocked(TelegramAuthUtil.hasRequiredFields).mockReturnValue(true);
      vi.mocked(TelegramAuthUtil.isAuthDateValid).mockReturnValue(true);
      vi.mocked(TelegramAuthUtil.verifyAuthData).mockReturnValue(true);
      mockCredentialsService.findOne.mockRejectedValue(
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

  describe('disconnect', () => {
    const orgId = new Types.ObjectId().toString();
    const brandId = new Types.ObjectId().toString();

    it('should disconnect and soft-delete credential', async () => {
      const credentialId = new Types.ObjectId();
      mockCredentialsService.findOne.mockResolvedValue({
        _id: credentialId,
      });
      mockCredentialsService.patch.mockResolvedValue({ isDeleted: true });

      const result = await service.disconnect(orgId, brandId);

      expect(result).toEqual({ success: true });
      expect(mockCredentialsService.patch).toHaveBeenCalledWith(credentialId, {
        isConnected: false,
        isDeleted: true,
      });
    });

    it('should throw NOT_FOUND when no credential exists', async () => {
      mockCredentialsService.findOne.mockResolvedValue(null);

      await expect(service.disconnect(orgId, brandId)).rejects.toThrow(
        HttpException,
      );

      try {
        await service.disconnect(orgId, brandId);
      } catch (e) {
        expect((e as HttpException).getStatus()).toBe(HttpStatus.NOT_FOUND);
      }
    });

    it('should wrap unexpected errors in INTERNAL_SERVER_ERROR', async () => {
      mockCredentialsService.findOne.mockRejectedValue(new Error('DB failure'));

      await expect(service.disconnect(orgId, brandId)).rejects.toThrow(
        HttpException,
      );
    });
  });
});
