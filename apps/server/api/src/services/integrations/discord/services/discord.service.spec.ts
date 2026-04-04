vi.mock('@api/shared/utils/encryption/encryption.util', () => ({
  EncryptionUtil: { decrypt: vi.fn((val: string) => val) },
}));

import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { ConfigService } from '@api/config/config.service';
import { DiscordService } from '@api/services/integrations/discord/services/discord.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { HttpException, HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { of, throwError } from 'rxjs';

describe('DiscordService', () => {
  let service: DiscordService;
  let configService: ConfigService;
  let credentialsService: CredentialsService;
  let httpService: HttpService;

  const mockConfigGet = vi.fn((key: string) => {
    const config: Record<string, string> = {
      DISCORD_CLIENT_ID: 'test-client-id',
      DISCORD_CLIENT_SECRET: 'test-client-secret',
      DISCORD_REDIRECT_URI: 'https://app.genfeed.ai/oauth/discord',
    };
    return config[key];
  });

  const mockCredentialsService = {
    create: vi.fn(),
    findOne: vi.fn(),
    patch: vi.fn(),
  };

  const mockHttpService = {
    get: vi.fn(),
    post: vi.fn(),
  };

  const mockLoggerService = {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DiscordService,
        {
          provide: ConfigService,
          useValue: { get: mockConfigGet },
        },
        {
          provide: CredentialsService,
          useValue: mockCredentialsService,
        },
        {
          provide: HttpService,
          useValue: mockHttpService,
        },
        {
          provide: LoggerService,
          useValue: mockLoggerService,
        },
      ],
    }).compile();

    service = module.get<DiscordService>(DiscordService);
    configService = module.get<ConfigService>(ConfigService);
    credentialsService = module.get<CredentialsService>(CredentialsService);
    httpService = module.get<HttpService>(HttpService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateAuthUrl', () => {
    it('should generate a valid Discord OAuth URL with correct params', () => {
      const url = service.generateAuthUrl('test-state');

      expect(url).toContain('https://discord.com/api/oauth2/authorize');
      expect(url).toContain('client_id=test-client-id');
      expect(url).toContain(
        'redirect_uri=' +
          encodeURIComponent('https://app.genfeed.ai/oauth/discord'),
      );
      expect(url).toContain('response_type=code');
      expect(url).toContain('scope=identify+email');
      expect(url).toContain('state=test-state');
    });

    it('should throw HttpException when config is missing', async () => {
      // Create service with missing config
      const missingConfigModule = await Test.createTestingModule({
        providers: [
          DiscordService,
          { provide: ConfigService, useValue: { get: vi.fn() } },
          { provide: CredentialsService, useValue: mockCredentialsService },
          { provide: HttpService, useValue: mockHttpService },
          { provide: LoggerService, useValue: mockLoggerService },
        ],
      }).compile();

      const svcMissingConfig =
        missingConfigModule.get<DiscordService>(DiscordService);

      expect(() => svcMissingConfig.generateAuthUrl('state')).toThrow(
        HttpException,
      );
    });
  });

  describe('exchangeCodeForToken', () => {
    it('should exchange auth code for token successfully', async () => {
      const tokenData = {
        access_token: 'discord-access-token',
        expires_in: 604800,
        refresh_token: 'discord-refresh-token',
        token_type: 'Bearer',
      };

      mockHttpService.post.mockReturnValue(of({ data: tokenData }));

      const result = await service.exchangeCodeForToken('auth-code');

      expect(result).toEqual(tokenData);
      expect(mockHttpService.post).toHaveBeenCalledWith(
        'https://discord.com/api/oauth2/token',
        expect.stringContaining('code=auth-code'),
        expect.objectContaining({
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        }),
      );
    });

    it('should throw HttpException on token exchange failure', async () => {
      const error = {
        response: { data: { error_description: 'Invalid code' } },
      };
      mockHttpService.post.mockReturnValue(throwError(() => error));

      await expect(service.exchangeCodeForToken('bad-code')).rejects.toThrow(
        HttpException,
      );
      expect(mockLoggerService.error).toHaveBeenCalled();
    });
  });

  describe('getUserInfo', () => {
    it('should fetch user info with correct authorization header', async () => {
      const userData = {
        avatar: 'abc123',
        global_name: 'Test User',
        id: '123456789',
        username: 'testuser',
      };

      mockHttpService.get.mockReturnValue(of({ data: userData }));

      const result = await service.getUserInfo('access-token');

      expect(result).toEqual(userData);
      expect(mockHttpService.get).toHaveBeenCalledWith(
        'https://discord.com/api/users/@me',
        { headers: { Authorization: 'Bearer access-token' } },
      );
    });

    it('should throw UNAUTHORIZED HttpException on user info failure', async () => {
      mockHttpService.get.mockReturnValue(
        throwError(() => ({
          response: { data: { message: 'Invalid token' } },
        })),
      );

      await expect(service.getUserInfo('bad-token')).rejects.toThrow(
        HttpException,
      );

      try {
        await service.getUserInfo('bad-token');
      } catch (e) {
        expect((e as HttpException).getStatus()).toBe(HttpStatus.UNAUTHORIZED);
      }
    });
  });

  describe('refreshToken', () => {
    const orgId = new Types.ObjectId().toString();
    const brandId = new Types.ObjectId().toString();

    it('should refresh token and update credential', async () => {
      const credentialId = new Types.ObjectId();
      const existingCredential = {
        _id: credentialId,
        refreshToken: 'encrypted-refresh-token',
      };

      mockCredentialsService.findOne.mockResolvedValue(existingCredential);
      mockHttpService.post.mockReturnValue(
        of({
          data: {
            access_token: 'new-access-token',
            expires_in: 604800,
            refresh_token: 'new-refresh-token',
          },
        }),
      );
      mockCredentialsService.patch.mockResolvedValue({
        _id: credentialId,
        isConnected: true,
      });

      const result = await service.refreshToken(orgId, brandId);

      expect(mockCredentialsService.patch).toHaveBeenCalledWith(
        credentialId,
        expect.objectContaining({
          accessToken: 'new-access-token',
          isConnected: true,
        }),
      );
      expect(result).toEqual({ _id: credentialId, isConnected: true });
    });

    it('should throw NOT_FOUND when credential does not exist', async () => {
      mockCredentialsService.findOne.mockResolvedValue(null);

      await expect(service.refreshToken(orgId, brandId)).rejects.toThrow(
        HttpException,
      );
    });

    it('should mark credential as disconnected on refresh failure', async () => {
      const credentialId = new Types.ObjectId();
      mockCredentialsService.findOne.mockResolvedValue({
        _id: credentialId,
        refreshToken: 'encrypted-token',
      });
      mockHttpService.post.mockReturnValue(
        throwError(() => new Error('Network error')),
      );

      await expect(service.refreshToken(orgId, brandId)).rejects.toThrow(
        HttpException,
      );
      expect(mockCredentialsService.patch).toHaveBeenCalledWith(credentialId, {
        isConnected: false,
      });
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

    it('should throw NOT_FOUND when credential does not exist', async () => {
      mockCredentialsService.findOne.mockResolvedValue(null);

      await expect(service.disconnect(orgId, brandId)).rejects.toThrow(
        HttpException,
      );
    });
  });
});
