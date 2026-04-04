import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SnapchatService } from '../services/snapchat.service';
import { SnapchatController } from './snapchat.controller';

vi.mock('../services/snapchat.service');
vi.mock('@libs/logger/logger.service');
vi.mock('@api/helpers/decorators/swagger/auto-swagger.decorator', () => ({
  AutoSwagger: () => () => undefined,
}));

describe('SnapchatController', () => {
  let controller: SnapchatController;

  const mockSnapchatService = {
    exchangeCodeForToken: vi.fn(),
    generateAuthUrl: vi.fn(),
  };

  const mockLoggerService = {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SnapchatController],
      providers: [
        { provide: SnapchatService, useValue: mockSnapchatService },
        { provide: LoggerService, useValue: mockLoggerService },
      ],
    }).compile();

    controller = module.get<SnapchatController>(SnapchatController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getAuthUrl()', () => {
    it('should return auth URL from service', () => {
      mockSnapchatService.generateAuthUrl.mockReturnValue(
        'https://accounts.snapchat.com/oauth2/authorize?state=abc',
      );

      const result = controller.getAuthUrl('abc');

      expect(result).toEqual({
        data: {
          url: 'https://accounts.snapchat.com/oauth2/authorize?state=abc',
        },
      });
    });

    it('should pass state to generateAuthUrl', () => {
      mockSnapchatService.generateAuthUrl.mockReturnValue(
        'https://snap.com/auth',
      );

      controller.getAuthUrl('my-state');

      expect(mockSnapchatService.generateAuthUrl).toHaveBeenCalledWith(
        'my-state',
      );
    });

    it('should pass empty string when state is undefined', () => {
      mockSnapchatService.generateAuthUrl.mockReturnValue(
        'https://snap.com/auth',
      );

      controller.getAuthUrl(undefined as any);

      expect(mockSnapchatService.generateAuthUrl).toHaveBeenCalledWith('');
    });

    it('should log auth url request', () => {
      mockSnapchatService.generateAuthUrl.mockReturnValue(
        'https://snap.com/auth',
      );

      controller.getAuthUrl('test');

      expect(mockLoggerService.log).toHaveBeenCalledWith('Snapchat auth url');
    });
  });

  describe('exchangeToken()', () => {
    it('should return token data from service', async () => {
      const tokenResult = {
        access_token: 'snap-access-token',
        refresh_token: 'snap-refresh-token',
      };
      mockSnapchatService.exchangeCodeForToken.mockResolvedValue(tokenResult);

      const result = await controller.exchangeToken({ code: 'auth-code-123' });

      expect(result).toEqual({ data: tokenResult });
    });

    it('should pass code to exchangeCodeForToken', async () => {
      mockSnapchatService.exchangeCodeForToken.mockResolvedValue({});

      await controller.exchangeToken({ code: 'my-code' });

      expect(mockSnapchatService.exchangeCodeForToken).toHaveBeenCalledWith(
        'my-code',
      );
    });

    it('should log exchange token request', async () => {
      mockSnapchatService.exchangeCodeForToken.mockResolvedValue({});

      await controller.exchangeToken({ code: 'code' });

      expect(mockLoggerService.log).toHaveBeenCalledWith(
        'Snapchat exchange token',
      );
    });

    it('should propagate errors from service', async () => {
      mockSnapchatService.exchangeCodeForToken.mockRejectedValue(
        new Error('Invalid code'),
      );

      await expect(
        controller.exchangeToken({ code: 'bad-code' }),
      ).rejects.toThrow('Invalid code');
    });
  });
});
