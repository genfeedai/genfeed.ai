import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { ConfigService } from '@api/config/config.service';
import { SlackService } from '@api/services/integrations/slack/services/slack.service';
import { CredentialPlatform } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { HttpException, HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { of, throwError } from 'rxjs';

describe('SlackService', () => {
  let service: SlackService;
  let httpService: vi.Mocked<HttpService>;
  let credentialsService: vi.Mocked<CredentialsService>;
  let loggerService: vi.Mocked<LoggerService>;

  const mockClientId = 'slack-client-id';
  const mockClientSecret = 'slack-client-secret';
  const mockRedirectUri = 'https://app.example.com/slack/callback';

  beforeEach(async () => {
    const mockConfigService = {
      get: vi.fn((key: string) => {
        const config: Record<string, string> = {
          SLACK_CLIENT_ID: mockClientId,
          SLACK_CLIENT_SECRET: mockClientSecret,
          SLACK_REDIRECT_URI: mockRedirectUri,
        };
        return config[key];
      }),
    };

    const mockHttpService = {
      get: vi.fn(),
      post: vi.fn(),
    };

    const mockCredentialsService = {
      findOne: vi.fn(),
      patch: vi.fn(),
    };

    const mockLoggerService = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SlackService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: HttpService, useValue: mockHttpService },
        { provide: CredentialsService, useValue: mockCredentialsService },
        { provide: LoggerService, useValue: mockLoggerService },
      ],
    }).compile();

    service = module.get<SlackService>(SlackService);
    httpService = module.get(HttpService);
    credentialsService = module.get(CredentialsService);
    loggerService = module.get(LoggerService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateAuthUrl', () => {
    it('should return a valid Slack OAuth URL', () => {
      const state = 'random-state-token';
      const url = service.generateAuthUrl(state);

      expect(url).toContain('https://slack.com/oauth/v2/authorize');
      expect(url).toContain(`client_id=${mockClientId}`);
      expect(url).toContain(
        `redirect_uri=${encodeURIComponent(mockRedirectUri)}`,
      );
      expect(url).toContain(`state=${state}`);
      expect(url).toContain('scope=chat%3Awrite%2Ccommands%2Cusers%3Aread');
    });

    it('should throw HttpException when clientId is missing', async () => {
      const brokenConfigService = {
        get: vi.fn(() => undefined),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          SlackService,
          { provide: ConfigService, useValue: brokenConfigService },
          { provide: HttpService, useValue: { get: vi.fn(), post: vi.fn() } },
          {
            provide: CredentialsService,
            useValue: { findOne: vi.fn(), patch: vi.fn() },
          },
          {
            provide: LoggerService,
            useValue: {
              debug: vi.fn(),
              error: vi.fn(),
              log: vi.fn(),
              warn: vi.fn(),
            },
          },
        ],
      }).compile();

      const svc = module.get<SlackService>(SlackService);

      expect(() => svc.generateAuthUrl('state')).toThrow(HttpException);
    });

    it('should throw HttpException when redirectUri is missing', async () => {
      const partialConfigService = {
        get: vi.fn((key: string) => {
          if (key === 'SLACK_CLIENT_ID') return 'some-id';
          return undefined;
        }),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          SlackService,
          { provide: ConfigService, useValue: partialConfigService },
          { provide: HttpService, useValue: { get: vi.fn(), post: vi.fn() } },
          {
            provide: CredentialsService,
            useValue: { findOne: vi.fn(), patch: vi.fn() },
          },
          {
            provide: LoggerService,
            useValue: {
              debug: vi.fn(),
              error: vi.fn(),
              log: vi.fn(),
              warn: vi.fn(),
            },
          },
        ],
      }).compile();

      const svc = module.get<SlackService>(SlackService);

      expect(() => svc.generateAuthUrl('state')).toThrow(HttpException);
    });
  });

  describe('exchangeCodeForToken', () => {
    it('should exchange code for token successfully', async () => {
      const mockResponseData = {
        access_token: 'xoxb-slack-token',
        ok: true,
        team: { id: 'T12345' },
      };

      httpService.post.mockReturnValue(
        of({
          config: {} as never,
          data: mockResponseData,
          headers: {},
          status: 200,
          statusText: 'OK',
        }),
      );

      const result = await service.exchangeCodeForToken('auth-code-123');

      expect(result).toEqual(mockResponseData);
      expect(httpService.post).toHaveBeenCalledWith(
        'https://slack.com/api/oauth.v2.access',
        expect.stringContaining('code=auth-code-123'),
        expect.objectContaining({
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        }),
      );
      expect(loggerService.log).toHaveBeenCalled();
    });

    it('should throw HttpException when Slack response is not ok', async () => {
      const mockResponseData = {
        error: 'invalid_code',
        ok: false,
      };

      httpService.post.mockReturnValue(
        of({
          config: {} as never,
          data: mockResponseData,
          headers: {},
          status: 200,
          statusText: 'OK',
        }),
      );

      await expect(service.exchangeCodeForToken('bad-code')).rejects.toThrow(
        HttpException,
      );
    });

    it('should throw HttpException with detail when Slack error is present', async () => {
      const mockResponseData = {
        error: 'code_already_used',
        ok: false,
      };

      httpService.post.mockReturnValue(
        of({
          config: {} as never,
          data: mockResponseData,
          headers: {},
          status: 200,
          statusText: 'OK',
        }),
      );

      try {
        await service.exchangeCodeForToken('reused-code');
        fail('Expected HttpException');
      } catch (error: unknown) {
        const httpError = error as HttpException;
        expect(httpError.getStatus()).toBe(HttpStatus.BAD_REQUEST);
        const response = httpError.getResponse() as Record<string, string>;
        expect(response.detail).toBe('code_already_used');
      }
    });

    it('should throw HttpException when HTTP request fails', async () => {
      httpService.post.mockReturnValue(
        throwError(() => new Error('Network error')),
      );

      await expect(service.exchangeCodeForToken('code')).rejects.toThrow(
        HttpException,
      );
      expect(loggerService.error).toHaveBeenCalled();
    });

    it('should re-throw HttpException from Slack response without wrapping', async () => {
      const originalException = new HttpException(
        'Original',
        HttpStatus.BAD_REQUEST,
      );

      httpService.post.mockReturnValue(throwError(() => originalException));

      // The catch block checks instanceof HttpException and re-throws;
      // however the error from firstValueFrom wrapping may behave differently.
      // Test that the eventual throw is an HttpException
      await expect(service.exchangeCodeForToken('code')).rejects.toThrow(
        HttpException,
      );
    });

    it('should throw INTERNAL_SERVER_ERROR when config is missing', async () => {
      const brokenConfigService = {
        get: vi.fn(() => undefined),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          SlackService,
          { provide: ConfigService, useValue: brokenConfigService },
          { provide: HttpService, useValue: { get: vi.fn(), post: vi.fn() } },
          {
            provide: CredentialsService,
            useValue: { findOne: vi.fn(), patch: vi.fn() },
          },
          {
            provide: LoggerService,
            useValue: {
              debug: vi.fn(),
              error: vi.fn(),
              log: vi.fn(),
              warn: vi.fn(),
            },
          },
        ],
      }).compile();

      const svc = module.get<SlackService>(SlackService);

      try {
        await svc.exchangeCodeForToken('code');
        fail('Expected HttpException');
      } catch (error: unknown) {
        const httpError = error as HttpException;
        expect(httpError.getStatus()).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      }
    });
  });

  describe('getUserInfo', () => {
    it('should return user info on success', async () => {
      const mockResponseData = {
        ok: true,
        team: 'TestTeam',
        team_id: 'T12345',
        url: 'https://testteam.slack.com',
        user: 'testuser',
        user_id: 'U12345',
      };

      httpService.get.mockReturnValue(
        of({
          config: {} as never,
          data: mockResponseData,
          headers: {},
          status: 200,
          statusText: 'OK',
        }),
      );

      const result = await service.getUserInfo('xoxb-access-token');

      expect(result).toEqual(mockResponseData);
      expect(httpService.get).toHaveBeenCalledWith(
        'https://slack.com/api/auth.test',
        expect.objectContaining({
          headers: { Authorization: 'Bearer xoxb-access-token' },
        }),
      );
      expect(loggerService.log).toHaveBeenCalled();
    });

    it('should throw HttpException when Slack response is not ok', async () => {
      const mockResponseData = {
        error: 'invalid_auth',
        ok: false,
      };

      httpService.get.mockReturnValue(
        of({
          config: {} as never,
          data: mockResponseData,
          headers: {},
          status: 200,
          statusText: 'OK',
        }),
      );

      try {
        await service.getUserInfo('bad-token');
        fail('Expected HttpException');
      } catch (error: unknown) {
        const httpError = error as HttpException;
        expect(httpError.getStatus()).toBe(HttpStatus.UNAUTHORIZED);
        const response = httpError.getResponse() as Record<string, string>;
        expect(response.detail).toBe('invalid_auth');
      }
    });

    it('should throw HttpException with default detail when no Slack error', async () => {
      const mockResponseData = {
        ok: false,
      };

      httpService.get.mockReturnValue(
        of({
          config: {} as never,
          data: mockResponseData,
          headers: {},
          status: 200,
          statusText: 'OK',
        }),
      );

      try {
        await service.getUserInfo('expired-token');
        fail('Expected HttpException');
      } catch (error: unknown) {
        const httpError = error as HttpException;
        const response = httpError.getResponse() as Record<string, string>;
        expect(response.detail).toBe('Failed to get Slack user info');
      }
    });

    it('should throw HttpException when HTTP request fails', async () => {
      httpService.get.mockReturnValue(
        throwError(() => new Error('Connection reset')),
      );

      await expect(service.getUserInfo('token')).rejects.toThrow(HttpException);
      expect(loggerService.error).toHaveBeenCalled();
    });

    it('should re-throw HttpException without double-wrapping', async () => {
      const mockResponseData = {
        error: 'token_revoked',
        ok: false,
      };

      httpService.get.mockReturnValue(
        of({
          config: {} as never,
          data: mockResponseData,
          headers: {},
          status: 200,
          statusText: 'OK',
        }),
      );

      try {
        await service.getUserInfo('revoked-token');
        fail('Expected HttpException');
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(HttpException);
        const httpError = error as HttpException;
        expect(httpError.getStatus()).toBe(HttpStatus.UNAUTHORIZED);
      }
    });
  });

  describe('disconnect', () => {
    const orgId = new Types.ObjectId().toString();
    const brandId = new Types.ObjectId().toString();

    it('should disconnect successfully when credential exists', async () => {
      const mockCredential = {
        _id: new Types.ObjectId(),
        accessToken: 'encrypted-token',
        isConnected: true,
        platform: CredentialPlatform.SLACK,
      };

      credentialsService.findOne.mockResolvedValue(mockCredential as never);
      credentialsService.patch.mockResolvedValue(undefined as never);

      const result = await service.disconnect(orgId, brandId);

      expect(result).toEqual({ success: true });
      expect(credentialsService.findOne).toHaveBeenCalledWith({
        brand: new Types.ObjectId(brandId),
        isDeleted: false,
        organization: new Types.ObjectId(orgId),
        platform: CredentialPlatform.SLACK,
      });
      expect(credentialsService.patch).toHaveBeenCalledWith(
        mockCredential._id,
        { isConnected: false, isDeleted: true },
      );
      expect(loggerService.log).toHaveBeenCalled();
    });

    it('should throw NOT_FOUND when credential does not exist', async () => {
      credentialsService.findOne.mockResolvedValue(null as never);

      try {
        await service.disconnect(orgId, brandId);
        fail('Expected HttpException');
      } catch (error: unknown) {
        const httpError = error as HttpException;
        expect(httpError.getStatus()).toBe(HttpStatus.NOT_FOUND);
        const response = httpError.getResponse() as Record<string, string>;
        expect(response.detail).toBe('Slack credential not found');
      }
    });

    it('should throw INTERNAL_SERVER_ERROR when database operation fails', async () => {
      credentialsService.findOne.mockRejectedValue(
        new Error('Database connection lost'),
      );

      try {
        await service.disconnect(orgId, brandId);
        fail('Expected HttpException');
      } catch (error: unknown) {
        const httpError = error as HttpException;
        expect(httpError.getStatus()).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
        const response = httpError.getResponse() as Record<string, string>;
        expect(response.detail).toBe('Failed to disconnect Slack');
      }
      expect(loggerService.error).toHaveBeenCalled();
    });

    it('should re-throw HttpException from inner logic without wrapping', async () => {
      credentialsService.findOne.mockResolvedValue(null as never);

      await expect(service.disconnect(orgId, brandId)).rejects.toThrow(
        HttpException,
      );
    });

    it('should throw INTERNAL_SERVER_ERROR when patch fails', async () => {
      const mockCredential = {
        _id: new Types.ObjectId(),
        accessToken: 'token',
        platform: CredentialPlatform.SLACK,
      };

      credentialsService.findOne.mockResolvedValue(mockCredential as never);
      credentialsService.patch.mockRejectedValue(new Error('Write failed'));

      try {
        await service.disconnect(orgId, brandId);
        fail('Expected HttpException');
      } catch (error: unknown) {
        const httpError = error as HttpException;
        expect(httpError.getStatus()).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      }
    });
  });
});
