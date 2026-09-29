vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeSingle: vi.fn(
    (_request: unknown, _serializer: unknown, data: unknown) => data,
  ),
}));

import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { SnapchatService } from '@api/services/integrations/snapchat/services/snapchat.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SnapchatController } from './snapchat.controller';

vi.mock('@api/services/integrations/snapchat/services/snapchat.service');
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
  const mockBrandsService = {
    findOne: vi.fn().mockResolvedValue({
      id: 'brand-id',
      organizationId: 'organization-id',
      userId: 'user-id',
    }),
  };
  const mockCredentialsService = {
    beginOAuthForBrand: vi.fn().mockResolvedValue({
      credential: { id: 'credential-id' },
      state: 'opaque-oauth-state',
    }),
    findPendingOAuthCredential: vi.fn().mockResolvedValue({
      brandId: 'brand-id',
      id: 'credential-id',
      organizationId: 'organization-id',
      userId: 'user-id',
    }),
    patch: vi.fn().mockResolvedValue({
      id: 'credential-id',
      isConnected: true,
    }),
  };
  const user = {
    organizationId: 'organization-id',
    userId: 'user-id',
  } as unknown as User;

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SnapchatController],
      providers: [
        { provide: SnapchatService, useValue: mockSnapchatService },
        { provide: LoggerService, useValue: mockLoggerService },
        { provide: BrandsService, useValue: mockBrandsService },
        { provide: CredentialsService, useValue: mockCredentialsService },
      ],
    }).compile();

    controller = module.get<SnapchatController>(SnapchatController);
  });

  describe('connect()', () => {
    it('should log auth url request', async () => {
      mockSnapchatService.generateAuthUrl.mockReturnValue(
        'https://snap.com/auth',
      );

      await controller.connect({} as never, user, { brandId: 'brand-id' });

      expect(mockLoggerService.log).toHaveBeenCalledWith('Snapchat auth url');
    });
  });

  describe('verify()', () => {
    it('should persist token data from service', async () => {
      const tokenResult = {
        accessToken: 'snap-access-token',
        refreshToken: 'snap-refresh-token',
      };
      mockSnapchatService.exchangeCodeForToken.mockResolvedValue(tokenResult);

      const result = await controller.verify({} as never, {
        code: 'auth-code-123',
        state: 'opaque-oauth-state',
      });

      expect(mockCredentialsService.patch).toHaveBeenCalledWith(
        'credential-id',
        expect.objectContaining({
          accessToken: 'snap-access-token',
          oauthState: null,
          refreshToken: 'snap-refresh-token',
        }),
      );
      expect(result).toEqual({ id: 'credential-id', isConnected: true });
    });

    it('should propagate errors from service', async () => {
      mockSnapchatService.exchangeCodeForToken.mockRejectedValue(
        new Error('Invalid code'),
      );

      await expect(
        controller.verify({} as never, {
          code: 'bad-code',
          state: 'opaque-oauth-state',
        }),
      ).rejects.toThrow('Invalid code');
    });
  });
});
