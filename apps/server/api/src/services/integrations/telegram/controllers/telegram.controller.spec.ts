import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { TelegramController } from '@api/services/integrations/telegram/controllers/telegram.controller';
import {
  type TelegramAuthData,
  TelegramService,
} from '@api/services/integrations/telegram/services/telegram.service';
import { HttpException, HttpStatus } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';

describe('TelegramController', () => {
  let controller: TelegramController;
  let telegramService: {
    disconnect: ReturnType<typeof vi.fn>;
    verifyAndSaveAuth: ReturnType<typeof vi.fn>;
  };

  const orgId = 'test-object-id';
  const brandId = 'test-object-id';
  const userId = 'test-object-id';
  const mockUser = {
    publicMetadata: {
      user: userId,
    },
  } as Record<string, unknown>;

  const validAuthData: TelegramAuthData = {
    auth_date: Math.floor(Date.now() / 1000),
    first_name: 'John',
    hash: 'abcdef1234567890',
    id: 123456789,
    last_name: 'Doe',
    photo_url: 'https://t.me/photo.jpg',
    username: 'johndoe',
  };

  const mockCredential = {
    _id: 'test-object-id',
    externalHandle: 'johndoe',
    externalId: '123456789',
    isConnected: true,
    platform: 'telegram',
  };

  beforeEach(async () => {
    telegramService = {
      disconnect: vi.fn().mockResolvedValue({ success: true }),
      verifyAndSaveAuth: vi.fn().mockResolvedValue(mockCredential),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TelegramController],
      providers: [{ provide: TelegramService, useValue: telegramService }],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<TelegramController>(TelegramController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('verify', () => {
    it('should call verifyAndSaveAuth with correct arguments', async () => {
      await controller.verify(mockUser, orgId, brandId, validAuthData);
      expect(telegramService.verifyAndSaveAuth).toHaveBeenCalledWith(
        orgId,
        brandId,
        userId.toString(),
        validAuthData,
      );
    });

    it('should return the saved credential', async () => {
      const result = await controller.verify(
        mockUser,
        orgId,
        brandId,
        validAuthData,
      );
      expect(result).toEqual(mockCredential);
    });

    it('should propagate errors from service', async () => {
      telegramService.verifyAndSaveAuth.mockRejectedValueOnce(
        new HttpException(
          { detail: 'Invalid Signature', title: 'Unauthorized' },
          HttpStatus.UNAUTHORIZED,
        ),
      );
      await expect(
        controller.verify(mockUser, orgId, brandId, validAuthData),
      ).rejects.toThrow(HttpException);
    });

    it('should propagate BAD_REQUEST for missing fields', async () => {
      telegramService.verifyAndSaveAuth.mockRejectedValueOnce(
        new HttpException(
          { detail: 'Missing required fields', title: 'Invalid Auth Data' },
          HttpStatus.BAD_REQUEST,
        ),
      );
      await expect(
        controller.verify(mockUser, orgId, brandId, validAuthData),
      ).rejects.toThrow(HttpException);
    });

    it('should propagate expired auth error', async () => {
      telegramService.verifyAndSaveAuth.mockRejectedValueOnce(
        new HttpException(
          { detail: 'Auth data expired', title: 'Expired Authentication' },
          HttpStatus.BAD_REQUEST,
        ),
      );
      await expect(
        controller.verify(mockUser, orgId, brandId, validAuthData),
      ).rejects.toThrow(HttpException);
    });

    it('should pass publicMetadata.user as userId', async () => {
      await controller.verify(mockUser, orgId, brandId, validAuthData);
      const callArgs = telegramService.verifyAndSaveAuth.mock
        .calls[0] as unknown[];
      expect(callArgs[2]).toBe(userId);
    });
  });

  describe('disconnect', () => {
    it('should call disconnect with org and brand IDs', async () => {
      await controller.disconnect(mockUser, orgId, brandId);
      expect(telegramService.disconnect).toHaveBeenCalledWith(orgId, brandId);
    });

    it('should return success response', async () => {
      const result = await controller.disconnect(mockUser, orgId, brandId);
      expect(result).toEqual({ success: true });
    });

    it('should propagate NOT_FOUND when credential not found', async () => {
      telegramService.disconnect.mockRejectedValueOnce(
        new HttpException(
          { detail: 'Credential not found', title: 'Not Found' },
          HttpStatus.NOT_FOUND,
        ),
      );
      await expect(
        controller.disconnect(mockUser, orgId, brandId),
      ).rejects.toThrow(HttpException);
    });

    it('should propagate internal errors', async () => {
      telegramService.disconnect.mockRejectedValueOnce(
        new HttpException(
          { detail: 'Failed to disconnect', title: 'Disconnect Failed' },
          HttpStatus.INTERNAL_SERVER_ERROR,
        ),
      );
      await expect(
        controller.disconnect(mockUser, orgId, brandId),
      ).rejects.toThrow(HttpException);
    });
  });
});
