import { MastodonService } from '@api/services/integrations/mastodon/services/mastodon.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import { MastodonController } from './mastodon.controller';

describe('MastodonController', () => {
  let controller: MastodonController;
  let mastodonService: {
    registerApp: ReturnType<typeof vi.fn>;
    generateAuthUrl: ReturnType<typeof vi.fn>;
    exchangeCodeForToken: ReturnType<typeof vi.fn>;
    verifyCredentials: ReturnType<typeof vi.fn>;
  };
  let loggerService: {
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    mastodonService = {
      exchangeCodeForToken: vi.fn(),
      generateAuthUrl: vi.fn(),
      registerApp: vi.fn(),
      verifyCredentials: vi.fn(),
    };
    loggerService = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MastodonController],
      providers: [
        { provide: MastodonService, useValue: mastodonService },
        { provide: LoggerService, useValue: loggerService },
      ],
    }).compile();

    controller = module.get(MastodonController);
  });

  describe('registerApp()', () => {
    it('returns wrapped registration data', async () => {
      const registration = {
        client_id: 'cid',
        client_secret: 'csec',
        id: '1',
        name: 'GenFeed',
        redirect_uri: 'https://example.com/callback',
      };
      mastodonService.registerApp.mockResolvedValueOnce(registration);

      const result = await controller.registerApp({
        instanceUrl: 'https://mastodon.social',
        redirectUri: 'https://example.com/callback',
      });

      expect(result).toEqual({ data: registration });
      expect(mastodonService.registerApp).toHaveBeenCalledWith(
        'https://mastodon.social',
        'https://example.com/callback',
      );
    });

    it('logs the instanceUrl during registration', async () => {
      mastodonService.registerApp.mockResolvedValueOnce({});

      await controller.registerApp({
        instanceUrl: 'https://mastodon.social',
        redirectUri: 'https://example.com/cb',
      });

      expect(loggerService.log).toHaveBeenCalledWith(
        expect.stringContaining('register'),
        expect.objectContaining({ instanceUrl: 'https://mastodon.social' }),
      );
    });
  });

  describe('getAuthUrl()', () => {
    it('returns wrapped auth URL', () => {
      mastodonService.generateAuthUrl.mockReturnValueOnce(
        'https://mastodon.social/oauth/authorize?...',
      );

      const result = controller.getAuthUrl(
        'https://mastodon.social',
        'client-id',
        'https://example.com/callback',
        'state-token',
      );

      expect(result).toEqual({
        data: { url: 'https://mastodon.social/oauth/authorize?...' },
      });
    });

    it('passes empty string when state param is undefined', () => {
      mastodonService.generateAuthUrl.mockReturnValueOnce('https://auth.url');

      controller.getAuthUrl(
        'https://mastodon.social',
        'cid',
        'https://example.com/cb',
        undefined as unknown as string,
      );

      expect(mastodonService.generateAuthUrl).toHaveBeenCalledWith(
        'https://mastodon.social',
        'cid',
        'https://example.com/cb',
        '',
      );
    });

    it('logs the instanceUrl on auth URL generation', () => {
      mastodonService.generateAuthUrl.mockReturnValueOnce('https://auth.url');

      controller.getAuthUrl(
        'https://mastodon.social',
        'cid',
        'https://example.com/cb',
        'state',
      );

      expect(loggerService.log).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ instanceUrl: 'https://mastodon.social' }),
      );
    });
  });

  describe('exchangeToken()', () => {
    it('returns wrapped token data', async () => {
      const tokenResponse = {
        access_token: 'tok',
        created_at: 1000000,
        scope: 'read write',
        token_type: 'Bearer',
      };
      mastodonService.exchangeCodeForToken.mockResolvedValueOnce(tokenResponse);

      const result = await controller.exchangeToken({
        clientId: 'cid',
        clientSecret: 'csec',
        code: 'auth-code',
        instanceUrl: 'https://mastodon.social',
        redirectUri: 'https://example.com/callback',
      });

      expect(result).toEqual({ data: tokenResponse });
      expect(mastodonService.exchangeCodeForToken).toHaveBeenCalledWith(
        'https://mastodon.social',
        'cid',
        'csec',
        'auth-code',
        'https://example.com/callback',
      );
    });
  });

  describe('verifyCredentials()', () => {
    it('returns wrapped account data', async () => {
      const account = { id: 'acc-1', username: 'testuser' };
      mastodonService.verifyCredentials.mockResolvedValueOnce(account);

      const result = await controller.verifyCredentials({
        accessToken: 'valid-token',
        instanceUrl: 'https://mastodon.social',
      });

      expect(result).toEqual({ data: account });
      expect(mastodonService.verifyCredentials).toHaveBeenCalledWith(
        'https://mastodon.social',
        'valid-token',
      );
    });

    it('propagates errors from mastodonService.verifyCredentials', async () => {
      mastodonService.verifyCredentials.mockRejectedValueOnce(
        new Error('Invalid token'),
      );

      await expect(
        controller.verifyCredentials({
          accessToken: 'bad-token',
          instanceUrl: 'https://mastodon.social',
        }),
      ).rejects.toThrow('Invalid token');
    });
  });
});
