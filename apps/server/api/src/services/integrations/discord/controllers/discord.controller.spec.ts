vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeSingle: vi.fn(
    (_request: unknown, _serializer: unknown, data: unknown) => data,
  ),
}));

import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { DiscordController } from '@api/services/integrations/discord/controllers/discord.controller';
import { DiscordService } from '@api/services/integrations/discord/services/discord.service';
import { HttpException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

describe('DiscordController', () => {
  let controller: DiscordController;

  const mockDiscordService = {
    exchangeCodeForToken: vi.fn(),
    generateAuthUrl: vi.fn(),
    getUserInfo: vi.fn(),
  };

  const mockCredentialsService = {
    beginOAuthForBrand: vi.fn(),
    findPendingOAuthCredential: vi.fn(),
    patch: vi.fn(),
  };

  const mockBrandsService = {
    findOne: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DiscordController],
      providers: [
        {
          provide: DiscordService,
          useValue: mockDiscordService,
        },
        {
          provide: CredentialsService,
          useValue: mockCredentialsService,
        },
        {
          provide: BrandsService,
          useValue: mockBrandsService,
        },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<DiscordController>(DiscordController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('connect', () => {
    const user = {
      publicMetadata: {
        organization: 'test-object-id',
        user: 'test-user-id',
      },
    } as unknown as User;
    const orgId = 'test-object-id';
    const brandId = 'test-object-id';

    it('starts OAuth for a brand in the authenticated organization', async () => {
      const brand = { id: brandId, organizationId: orgId };
      mockBrandsService.findOne.mockResolvedValue(brand);
      mockCredentialsService.beginOAuthForBrand.mockResolvedValue({
        credential: { id: 'new-cred' },
        state: 'opaque-oauth-state',
      });
      mockDiscordService.generateAuthUrl.mockReturnValue(
        'https://discord.com/oauth2/authorize?...',
      );

      const result = await controller.connect({} as never, user, brandId);

      expect(result).toHaveProperty('url');
      expect(result).not.toHaveProperty('state');
      expect(mockCredentialsService.beginOAuthForBrand).toHaveBeenCalledWith(
        brand,
        'test-user-id',
        'discord',
        { isConnected: false },
      );
      expect(mockDiscordService.generateAuthUrl).toHaveBeenCalledWith(
        'opaque-oauth-state',
      );
    });

    it('rejects a brand outside the authenticated organization', async () => {
      mockBrandsService.findOne.mockResolvedValue(null);

      await expect(
        controller.connect({} as never, user, brandId),
      ).rejects.toThrow(HttpException);

      expect(mockCredentialsService.beginOAuthForBrand).not.toHaveBeenCalled();
    });
  });

  describe('verify', () => {
    const user = {
      publicMetadata: {
        organization: 'test-object-id',
        user: 'test-user-id',
      },
    } as unknown as User;
    const orgId = 'test-object-id';

    it('should exchange code, get user info and update credential', async () => {
      const credentialId = 'test-object-id';
      mockCredentialsService.findPendingOAuthCredential.mockResolvedValue({
        id: credentialId,
      });
      mockDiscordService.exchangeCodeForToken.mockResolvedValue({
        access_token: 'access-token',
        expires_in: 604800,
        refresh_token: 'refresh-token',
      });
      mockDiscordService.getUserInfo.mockResolvedValue({
        avatar: 'avatar-hash',
        global_name: 'Test User',
        id: '123456',
        username: 'testuser',
      });
      mockCredentialsService.patch.mockResolvedValue({
        id: credentialId,
        isConnected: true,
      });

      const result = await controller.verify(
        {} as never,
        user,
        'auth-code',
        'state-token',
      );

      expect(
        mockCredentialsService.findPendingOAuthCredential,
      ).toHaveBeenCalledWith('state-token', 'discord', {
        organizationId: orgId,
        userId: 'test-user-id',
      });

      expect(mockDiscordService.exchangeCodeForToken).toHaveBeenCalledWith(
        'auth-code',
      );
      expect(mockDiscordService.getUserInfo).toHaveBeenCalledWith(
        'access-token',
      );
      expect(mockCredentialsService.patch).toHaveBeenCalledWith(
        credentialId,
        expect.objectContaining({
          accessToken: 'access-token',
          externalHandle: 'testuser',
          externalId: '123456',
          isConnected: true,
        }),
      );
      expect(result).toEqual({ id: credentialId, isConnected: true });
    });

    it('should throw BAD_REQUEST when no credential matches state', async () => {
      mockCredentialsService.findPendingOAuthCredential.mockResolvedValue(null);

      await expect(
        controller.verify({} as never, user, 'code', 'bad-state'),
      ).rejects.toThrow(HttpException);
    });

    it('should set avatar URL correctly when user has avatar', async () => {
      const credId = 'test-object-id';
      mockCredentialsService.findPendingOAuthCredential.mockResolvedValue({
        id: credId,
      });
      mockDiscordService.exchangeCodeForToken.mockResolvedValue({
        access_token: 'token',
        expires_in: 3600,
        refresh_token: 'rt',
      });
      mockDiscordService.getUserInfo.mockResolvedValue({
        avatar: 'abc123',
        id: '999',
        username: 'user',
      });
      mockCredentialsService.patch.mockResolvedValue({ id: credId });

      await controller.verify({} as never, user, 'code', 'state');

      expect(mockCredentialsService.patch).toHaveBeenCalledWith(
        credId,
        expect.objectContaining({
          externalAvatar: 'https://cdn.discordapp.com/avatars/999/abc123.png',
        }),
      );
    });
  });
});
