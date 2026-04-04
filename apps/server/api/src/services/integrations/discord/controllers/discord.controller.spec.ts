import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { DiscordController } from '@api/services/integrations/discord/controllers/discord.controller';
import { DiscordService } from '@api/services/integrations/discord/services/discord.service';
import { HttpException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';

describe('DiscordController', () => {
  let controller: DiscordController;
  let discordService: DiscordService;
  let credentialsService: CredentialsService;

  const mockDiscordService = {
    disconnect: vi.fn(),
    exchangeCodeForToken: vi.fn(),
    generateAuthUrl: vi.fn(),
    getUserInfo: vi.fn(),
  };

  const mockCredentialsService = {
    create: vi.fn(),
    findOne: vi.fn(),
    patch: vi.fn(),
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
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<DiscordController>(DiscordController);
    discordService = module.get<DiscordService>(DiscordService);
    credentialsService = module.get<CredentialsService>(CredentialsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('connect', () => {
    const user = { _id: new Types.ObjectId().toString() };
    const orgId = new Types.ObjectId().toString();
    const brandId = new Types.ObjectId().toString();

    it('should create new credential and return auth URL when no existing credential', async () => {
      mockCredentialsService.findOne.mockResolvedValue(null);
      mockCredentialsService.create.mockResolvedValue({ _id: 'new-cred' });
      mockDiscordService.generateAuthUrl.mockReturnValue(
        'https://discord.com/oauth2/authorize?...',
      );

      const result = await controller.connect(
        user as Record<string, unknown>,
        orgId,
        brandId,
      );

      expect(result).toHaveProperty('url');
      expect(result).toHaveProperty('state');
      expect(mockCredentialsService.create).toHaveBeenCalled();
      expect(mockDiscordService.generateAuthUrl).toHaveBeenCalled();
    });

    it('should update existing credential when one exists', async () => {
      const existingId = new Types.ObjectId();
      mockCredentialsService.findOne.mockResolvedValue({
        _id: existingId,
      });
      mockCredentialsService.patch.mockResolvedValue({ _id: existingId });
      mockDiscordService.generateAuthUrl.mockReturnValue(
        'https://discord.com/oauth2/authorize?...',
      );

      const result = await controller.connect(
        user as Record<string, unknown>,
        orgId,
        brandId,
      );

      expect(result).toHaveProperty('url');
      expect(mockCredentialsService.patch).toHaveBeenCalledWith(
        existingId,
        expect.objectContaining({
          isConnected: false,
          isDeleted: false,
        }),
      );
    });
  });

  describe('verify', () => {
    const user = { _id: new Types.ObjectId().toString() };
    const orgId = new Types.ObjectId().toString();
    const brandId = new Types.ObjectId().toString();

    it('should exchange code, get user info and update credential', async () => {
      const credentialId = new Types.ObjectId();
      mockCredentialsService.findOne.mockResolvedValue({
        _id: credentialId,
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
        _id: credentialId,
        isConnected: true,
      });

      const result = await controller.verify(
        user as Record<string, unknown>,
        orgId,
        brandId,
        'auth-code',
        'state-token',
      );

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
      expect(result).toEqual({ _id: credentialId, isConnected: true });
    });

    it('should throw BAD_REQUEST when no credential matches state', async () => {
      mockCredentialsService.findOne.mockResolvedValue(null);

      await expect(
        controller.verify(
          user as Record<string, unknown>,
          orgId,
          brandId,
          'code',
          'bad-state',
        ),
      ).rejects.toThrow(HttpException);
    });

    it('should set avatar URL correctly when user has avatar', async () => {
      const credId = new Types.ObjectId();
      mockCredentialsService.findOne.mockResolvedValue({ _id: credId });
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
      mockCredentialsService.patch.mockResolvedValue({ _id: credId });

      await controller.verify(
        user as Record<string, unknown>,
        orgId,
        brandId,
        'code',
        'state',
      );

      expect(mockCredentialsService.patch).toHaveBeenCalledWith(
        credId,
        expect.objectContaining({
          externalAvatar: 'https://cdn.discordapp.com/avatars/999/abc123.png',
        }),
      );
    });
  });

  describe('disconnect', () => {
    it('should delegate to discordService.disconnect', async () => {
      const user = { _id: 'user-id' };
      mockDiscordService.disconnect.mockResolvedValue({ success: true });

      const result = controller.disconnect(
        user as Record<string, unknown>,
        'org-id',
        'brand-id',
      );

      expect(mockDiscordService.disconnect).toHaveBeenCalledWith(
        'org-id',
        'brand-id',
      );
    });
  });
});
