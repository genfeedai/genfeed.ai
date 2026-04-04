vi.mock('@api/shared/utils/encryption/encryption.util', () => ({
  EncryptionUtil: {
    decrypt: vi.fn((val: string) => val.replace(/^enc:/, '')),
    encrypt: vi.fn((val: string) => `enc:${val}`),
  },
}));

import { ConfigService } from '@api/config/config.service';
import { OpenAiOAuthService } from '@api/services/integrations/openai-llm/services/openai-oauth.service';
import { ByokProvider } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';

describe('OpenAiOAuthService', () => {
  let service: OpenAiOAuthService;
  let configGetMock: ReturnType<typeof vi.fn>;
  let httpPostMock: ReturnType<typeof vi.fn>;
  let loggerMock: {
    log: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };

  const ORG_ID = 'org_abc123';
  const USER_ID = 'user_xyz456';

  beforeEach(() => {
    vi.clearAllMocks();

    configGetMock = vi.fn((key: string) => {
      const cfg: Record<string, string> = {
        GENFEEDAI_APP_URL: 'https://app.genfeed.ai',
        OPENAI_CODEX_REDIRECT_URI: 'https://app.genfeed.ai/oauth/openai',
      };
      return cfg[key];
    });

    httpPostMock = vi.fn();
    loggerMock = { error: vi.fn(), log: vi.fn() };

    service = new OpenAiOAuthService(
      { get: configGetMock } as unknown as ConfigService,
      loggerMock as unknown as LoggerService,
      { post: httpPostMock } as unknown as HttpService,
    );
  });

  describe('generateAuthUrl', () => {
    it('should return a valid OAuth URL', () => {
      const url = service.generateAuthUrl(ORG_ID, USER_ID);
      expect(url).toContain('https://auth.openai.com/oauth/authorize');
      expect(url).toContain('client_id=app_EMoamEEZ73f0CkXaXp7hrann');
    });

    it('should include PKCE code_challenge_method=S256', () => {
      const url = service.generateAuthUrl(ORG_ID, USER_ID);
      expect(url).toContain('code_challenge_method=S256');
    });

    it('should include redirect_uri from config', () => {
      const url = service.generateAuthUrl(ORG_ID, USER_ID);
      expect(url).toContain(
        encodeURIComponent('https://app.genfeed.ai/oauth/openai'),
      );
    });

    it('should include state parameter', () => {
      const url = service.generateAuthUrl(ORG_ID, USER_ID);
      expect(url).toContain('state=');
    });

    it('should include openid scope', () => {
      const url = service.generateAuthUrl(ORG_ID, USER_ID);
      expect(url).toContain('openid');
    });

    it('should fall back to GENFEEDAI_APP_URL when redirect URI is not configured', () => {
      configGetMock.mockImplementation((key: string) => {
        if (key === 'GENFEEDAI_APP_URL') return 'https://app.genfeed.ai';
        return undefined;
      });
      const svc = new OpenAiOAuthService(
        { get: configGetMock } as unknown as ConfigService,
        loggerMock as unknown as LoggerService,
        { post: httpPostMock } as unknown as HttpService,
      );
      const url = svc.generateAuthUrl(ORG_ID, USER_ID);
      expect(url).toContain('app.genfeed.ai');
    });

    it('should generate different code_challenges on each call (random PKCE)', () => {
      const url1 = service.generateAuthUrl(ORG_ID, USER_ID);
      const url2 = service.generateAuthUrl(ORG_ID, USER_ID);
      const challenge1 = new URL(url1).searchParams.get('code_challenge');
      const challenge2 = new URL(url2).searchParams.get('code_challenge');
      // PKCE verifier is random — challenges should differ
      expect(challenge1).not.toBe(challenge2);
    });
  });

  describe('exchangeCodeForTokens', () => {
    const makeJwt = (payload: Record<string, string>) => {
      const encoded = Buffer.from(JSON.stringify(payload)).toString(
        'base64url',
      );
      return `header.${encoded}.signature`;
    };

    it('should exchange code for tokens and return org/user ids', async () => {
      const accessToken = makeJwt({
        org_id: 'org_openai',
        sub: 'user_sub_123',
      });
      const tokenResponse = {
        access_token: accessToken,
        expires_in: 3600,
        refresh_token: 'refresh_tok',
        token_type: 'Bearer',
      };

      httpPostMock.mockReturnValue(of({ data: tokenResponse }));

      // Build a valid encrypted state
      const statePayload = JSON.stringify({
        codeVerifier: 'verifier123',
        organizationId: ORG_ID,
        userId: USER_ID,
      });
      const encryptedState = `enc:${statePayload}`;

      const result = await service.exchangeCodeForTokens(
        'code_abc',
        encryptedState,
      );
      expect(result.organizationId).toBe(ORG_ID);
      expect(result.userId).toBe(USER_ID);
      expect(result.tokens.access_token).toBe(accessToken);
      expect(result.accountId).toBe('org_openai');
    });

    it('should extract sub as accountId when org_id is absent', async () => {
      const accessToken = makeJwt({ sub: 'sub_fallback' });
      httpPostMock.mockReturnValue(
        of({
          data: {
            access_token: accessToken,
            expires_in: 3600,
            refresh_token: 'r',
            token_type: 'Bearer',
          },
        }),
      );

      const statePayload = JSON.stringify({
        codeVerifier: 'v',
        organizationId: ORG_ID,
        userId: USER_ID,
      });
      const result = await service.exchangeCodeForTokens(
        'code',
        `enc:${statePayload}`,
      );
      expect(result.accountId).toBe('sub_fallback');
    });

    it('should throw when HTTP post fails', async () => {
      httpPostMock.mockReturnValue(
        throwError(() => new Error('Network error')),
      );

      const statePayload = JSON.stringify({
        codeVerifier: 'v',
        organizationId: ORG_ID,
        userId: USER_ID,
      });
      await expect(
        service.exchangeCodeForTokens('code', `enc:${statePayload}`),
      ).rejects.toThrow('Network error');
    });
  });

  describe('refreshAccessToken', () => {
    it('should return new token set on success', async () => {
      const newTokens = {
        access_token: 'new_access',
        expires_in: 7200,
        refresh_token: 'new_refresh',
        token_type: 'Bearer',
      };
      httpPostMock.mockReturnValue(of({ data: newTokens }));

      const result = await service.refreshAccessToken('old_refresh_token');
      expect(result.access_token).toBe('new_access');
      expect(result.expires_in).toBe(7200);
    });

    it('should call token endpoint with refresh_token grant', async () => {
      httpPostMock.mockReturnValue(
        of({
          data: {
            access_token: 'a',
            expires_in: 100,
            refresh_token: 'r',
            token_type: 'Bearer',
          },
        }),
      );

      await service.refreshAccessToken('old_token');

      expect(httpPostMock).toHaveBeenCalledWith(
        'https://auth.openai.com/oauth/token',
        expect.stringContaining('grant_type=refresh_token'),
        expect.objectContaining({
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        }),
      );
    });

    it('should throw and log when refresh fails', async () => {
      httpPostMock.mockReturnValue(throwError(() => new Error('Unauthorized')));

      await expect(service.refreshAccessToken('bad_token')).rejects.toThrow(
        'Unauthorized',
      );
      expect(loggerMock.error).toHaveBeenCalled();
    });
  });

  describe('buildByokEntry', () => {
    it('should build a BYOK entry with encrypted tokens', () => {
      const tokens = {
        access_token: 'access_tok',
        expires_in: 3600,
        refresh_token: 'refresh_tok',
        token_type: 'Bearer',
      };

      const entry = service.buildByokEntry(tokens, 'acct_123');
      expect(entry.provider).toBe(ByokProvider.OPENAI);
      expect(entry.authMode).toBe('oauth');
      expect(entry.isEnabled).toBe(true);
      expect(entry.oauthAccountId).toBe('acct_123');
      expect(entry.apiKey).toContain('enc:');
      expect(entry.apiSecret).toContain('enc:');
    });

    it('should set expiresAt correctly relative to now', () => {
      const tokens = {
        access_token: 'tok',
        expires_in: 3600,
        refresh_token: 'ref',
        token_type: 'Bearer',
      };

      const before = Date.now();
      const entry = service.buildByokEntry(tokens, 'acct');
      const after = Date.now();

      expect(entry.expiresAt).toBeGreaterThanOrEqual(before + 3600 * 1000);
      expect(entry.expiresAt).toBeLessThanOrEqual(after + 3600 * 1000);
    });

    it('should handle missing refresh_token gracefully', () => {
      const tokens = {
        access_token: 'tok',
        expires_in: 3600,
        refresh_token: '',
        token_type: 'Bearer',
      };

      const entry = service.buildByokEntry(tokens, 'acct');
      expect(entry.apiSecret).toBeUndefined();
    });
  });
});
