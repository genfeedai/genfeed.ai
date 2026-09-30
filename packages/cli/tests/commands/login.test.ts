import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildAuthorizeUrl, createLoginCommand, exchangeAuthCode } from '../../src/commands/login';
import { GenfeedError } from '../../src/utils/errors';

const {
  mockGetLoginEndpoints,
  mockHandleError,
  mockListBrands,
  mockSetActiveBrand,
  mockSetApiKey,
  mockSetOrganizationId,
  mockSetProfileField,
  mockSetRole,
  mockValidateApiKey,
} = vi.hoisted(() => ({
  mockGetLoginEndpoints: vi.fn(),
  mockHandleError: vi.fn((error: unknown) => {
    throw error;
  }),
  mockListBrands: vi.fn(),
  mockSetActiveBrand: vi.fn(),
  mockSetApiKey: vi.fn(),
  mockSetOrganizationId: vi.fn(),
  mockSetProfileField: vi.fn(),
  mockSetRole: vi.fn(),
  mockValidateApiKey: vi.fn(),
}));

vi.mock('ora', () => {
  const spinner = {
    fail: vi.fn(() => spinner),
    start: () => spinner,
    succeed: vi.fn(() => spinner),
  };
  return { default: () => spinner };
});

vi.mock('@inquirer/prompts', () => ({
  password: vi.fn(),
  select: vi.fn(),
}));

vi.mock('../../src/api/auth', () => ({
  validateApiKey: () => mockValidateApiKey(),
}));

vi.mock('../../src/api/brands', () => ({
  listBrands: (organizationId: string) => mockListBrands(organizationId),
}));

vi.mock('../../src/config/store', () => ({
  getLoginEndpoints: () => mockGetLoginEndpoints(),
  setActiveBrand: (id: string) => mockSetActiveBrand(id),
  setApiKey: (key: string) => mockSetApiKey(key),
  setOrganizationId: (id: string) => mockSetOrganizationId(id),
  setProfileField: (key: string, value: unknown) => mockSetProfileField(key, value),
  setRole: (role: string) => mockSetRole(role),
}));

vi.mock('../../src/ui/theme', () => ({
  formatHeader: (value: string) => value,
  formatLabel: (label: string, value: string) => `${label}: ${value}`,
  formatSuccess: (value: string) => value,
  formatWarning: (value: string) => value,
  print: vi.fn(),
}));

vi.mock('../../src/utils/errors', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/utils/errors')>();
  return {
    ...actual,
    handleError: (error: unknown) => mockHandleError(error),
  };
});

const SELF_HOSTED_ENDPOINTS = {
  apiBaseUrl: 'https://api.selfhost.dev/v1',
  appUrl: 'https://app.selfhost.dev',
  authUrl: 'https://app.selfhost.dev/oauth/cli',
};

describe('login command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetLoginEndpoints.mockResolvedValue(SELF_HOSTED_ENDPOINTS);
    mockValidateApiKey.mockResolvedValue({
      organization: { id: 'org-1', name: 'Org' },
      scopes: ['read'],
      user: { email: 'user@example.com' },
    });
    mockListBrands.mockResolvedValue([{ id: 'brand-1', label: 'Brand' }]);
  });

  describe('buildAuthorizeUrl', () => {
    it('targets the resolved deployment auth URL with PKCE params', () => {
      const url = new URL(
        buildAuthorizeUrl(SELF_HOSTED_ENDPOINTS.authUrl, {
          challenge: 'challenge-123',
          port: 4321,
          state: 'state-123',
        })
      );

      expect(url.origin).toBe('https://app.selfhost.dev');
      expect(url.pathname).toBe('/oauth/cli');
      expect(url.searchParams.get('code_challenge')).toBe('challenge-123');
      expect(url.searchParams.get('code_challenge_method')).toBe('S256');
      expect(url.searchParams.get('port')).toBe('4321');
      expect(url.searchParams.get('state')).toBe('state-123');
    });

    it('selects account creation without changing the PKCE protocol', () => {
      const url = new URL(
        buildAuthorizeUrl(SELF_HOSTED_ENDPOINTS.authUrl, {
          challenge: 'challenge-123',
          intent: 'signup',
          port: 4321,
          state: 'state-123',
        })
      );

      expect(url.searchParams.get('intent')).toBe('signup');
      expect(url.searchParams.get('code_challenge_method')).toBe('S256');
      expect(url.searchParams.get('state')).toBe('state-123');
    });
  });

  describe('exchangeAuthCode', () => {
    it('posts the code to the deployment exchange endpoint', async () => {
      const fetchMock = vi.fn(
        async () =>
          new Response(
            JSON.stringify({ issuedAt: 'now', token: 'gf_live_key', userId: 'user-1' }),
            {
              headers: { 'content-type': 'application/json' },
              status: 200,
            }
          )
      );
      vi.stubGlobal('fetch', fetchMock);

      const data = await exchangeAuthCode(SELF_HOSTED_ENDPOINTS.apiBaseUrl, {
        code: 'code-123',
        codeVerifier: 'verifier-123',
        state: 'state-123',
      });

      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.selfhost.dev/v1/auth/desktop/exchange',
        expect.objectContaining({
          body: JSON.stringify({
            code: 'code-123',
            codeVerifier: 'verifier-123',
            state: 'state-123',
          }),
          method: 'POST',
        })
      );
      expect(data.token).toBe('gf_live_key');

      vi.unstubAllGlobals();
    });

    it('raises a Genfeed error when the exchange fails', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Response('code expired', { status: 400 }))
      );

      await expect(
        exchangeAuthCode(SELF_HOSTED_ENDPOINTS.apiBaseUrl, {
          code: 'code-123',
          codeVerifier: 'verifier-123',
          state: 'state-123',
        })
      ).rejects.toThrow(GenfeedError);

      vi.unstubAllGlobals();
    });

    it('raises a Genfeed error when no token comes back', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(
          async () =>
            new Response(JSON.stringify({}), {
              headers: { 'content-type': 'application/json' },
              status: 200,
            })
        )
      );

      await expect(
        exchangeAuthCode(SELF_HOSTED_ENDPOINTS.apiBaseUrl, {
          code: 'code-123',
          codeVerifier: 'verifier-123',
          state: 'state-123',
        })
      ).rejects.toThrow('No token returned by server');

      vi.unstubAllGlobals();
    });
  });

  describe('endpoint overrides', () => {
    it('persists normalized --api-url and --app-url before resolving endpoints', async () => {
      await createLoginCommand().parseAsync(
        [
          '--key',
          'gf_live_key',
          '--api-url',
          'https://api.selfhost.dev/v1/',
          '--app-url',
          'https://app.selfhost.dev/',
        ],
        { from: 'user' }
      );

      expect(mockSetProfileField).toHaveBeenCalledWith('apiUrl', 'https://api.selfhost.dev/v1');
      expect(mockSetProfileField).toHaveBeenCalledWith('appUrl', 'https://app.selfhost.dev');
      expect(mockGetLoginEndpoints).toHaveBeenCalled();
      expect(mockSetApiKey).toHaveBeenCalledWith('gf_live_key');
    });

    it('leaves the profile untouched when no endpoint flags are passed', async () => {
      await createLoginCommand().parseAsync(['--key', 'gf_live_key'], { from: 'user' });

      expect(mockSetProfileField).not.toHaveBeenCalled();
    });

    it('rejects a malformed API key before touching the profile', async () => {
      await expect(
        createLoginCommand().parseAsync(['--key', 'nope'], { from: 'user' })
      ).rejects.toThrow('Invalid API key format');

      expect(mockSetApiKey).not.toHaveBeenCalled();
    });
  });
});
