import type { ServerCredentialStore } from '@api/server.dependencies';
import { YoutubeAuthService } from '@api/services/integrations/youtube/services/modules/youtube-auth.service';
import {
  YoutubeOAuth2Util,
  type YoutubeOAuthClient,
} from '@api/shared/utils/youtube-oauth/youtube-oauth.util';
import type { ConfigService } from '@libs/config/config.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { HttpException, HttpStatus } from '@nestjs/common';

vi.mock('@api/shared/utils/youtube-oauth/youtube-oauth.util', () => ({
  YoutubeOAuth2Util: { createClient: vi.fn() },
}));

const orgId = 'org-1';
const brandId = 'brand-1';
const REFRESH_TOKEN =
  'refresh-token-that-is-definitely-longer-than-fifty-characters-here';

interface CredentialRow {
  accessToken?: string;
  accessTokenExpiry?: Date;
  brandId: string;
  grantedScopes?: string[];
  grantedScopesCapturedAt?: Date;
  id: string;
  isConnected: boolean;
  isDeleted: boolean;
  organizationId: string;
  platform: string;
  refreshToken: string | null;
}

interface GoogleGrant {
  access_token?: string | null;
  expiry_date?: number;
  refresh_token?: string;
  scope?: string;
}

const credential = (overrides: Partial<CredentialRow> = {}): CredentialRow => ({
  brandId,
  id: 'credential-1',
  isConnected: true,
  isDeleted: false,
  organizationId: orgId,
  platform: 'youtube',
  refreshToken: EncryptionUtil.encrypt(REFRESH_TOKEN),
  ...overrides,
});

/**
 * The brand's YouTube credentials and Google's token endpoint. Google answers
 * a refresh token it knows with the grant stored for it, and fails otherwise
 * with the configured error. Logger warnings are kept.
 */
function setup({
  credentials = [credential()],
  googleError = null as Error | null,
  grants = new Map<string, GoogleGrant>([
    [
      REFRESH_TOKEN,
      {
        access_token: 'new-access-token',
        expiry_date: Date.parse('2026-11-06T14:00:00Z'),
        scope: 'https://www.googleapis.com/auth/youtube.upload',
      },
    ],
  ]),
} = {}) {
  const warnings: { context: unknown; message: string }[] = [];
  const store = {
    patch: async (id: string, patch: Partial<CredentialRow>) => {
      const row = credentials.find((item) => item.id === id);
      if (row) Object.assign(row, patch);
      return row;
    },
    resolveBrandAccount: async (options: {
      brandId: string;
      credentialId?: string;
      isDisconnectedIncluded?: boolean;
      organizationId: string;
      platform: string;
    }) =>
      credentials.find(
        (row) =>
          row.organizationId === options.organizationId &&
          row.brandId === options.brandId &&
          row.platform === options.platform &&
          !row.isDeleted &&
          (options.isDisconnectedIncluded || row.isConnected) &&
          (!options.credentialId || row.id === options.credentialId),
      ) ?? null,
  };
  vi.mocked(YoutubeOAuth2Util.createClient).mockImplementation(() => {
    const client = {
      credentials: {} as GoogleGrant,
      getAccessToken: async () => {
        if (googleError) throw googleError;
        const grant = grants.get(client.credentials.refresh_token ?? '');
        client.credentials = { ...grant };
        return { res: null, token: grant?.access_token ?? null };
      },
      setCredentials: (creds: GoogleGrant) => {
        client.credentials = { ...client.credentials, ...creds };
      },
    };
    return client as unknown as YoutubeOAuthClient;
  });
  const silent = () => undefined;
  const service = new YoutubeAuthService(
    store as unknown as ServerCredentialStore,
    {
      error: silent,
      log: silent,
      warn: (message: string, context: unknown) => {
        warnings.push({ context, message });
      },
    } as unknown as LoggerService,
    { get: () => 'configured' } as unknown as ConfigService,
  );
  return { credentials, service, warnings };
}

describe('YoutubeAuthService.refreshToken', () => {
  it('returns a client holding the refreshed token and stores it on the credential', async () => {
    const { credentials, service } = setup();

    const client = await service.refreshToken(orgId, brandId);

    expect(client.credentials).toMatchObject({
      access_token: 'new-access-token',
    });
    expect(credentials[0]).toMatchObject({
      accessToken: 'new-access-token',
      accessTokenExpiry: new Date('2026-11-06T14:00:00Z'),
      grantedScopes: ['https://www.googleapis.com/auth/youtube.upload'],
      grantedScopesCapturedAt: expect.any(Date),
      isConnected: true,
      isDeleted: false,
    });
  });

  it('repairs a credential a failed refresh already disconnected', async () => {
    const { credentials, service } = setup({
      credentials: [credential({ isConnected: false })],
    });

    await service.refreshToken(orgId, brandId);

    expect(credentials[0].isConnected).toBe(true);
  });

  it('refreshes the account named by credentialId', async () => {
    // A brand may hold several YouTube channels; token repair addresses the
    // named one instead of whichever happens to be the brand default.
    const { credentials, service } = setup({
      credentials: [credential(), credential({ id: 'credential-2' })],
    });

    await service.refreshToken(orgId, brandId, 'credential-2');

    expect(credentials.map((row) => row.accessToken)).toEqual([
      undefined,
      'new-access-token',
    ]);
  });

  it.each([
    ['no credential', []],
    ['only another organization', [credential({ organizationId: 'org-2' })]],
    ['only a deleted credential', [credential({ isDeleted: true })]],
  ])('fails with %s', async (_name, credentials) => {
    const { service } = setup({ credentials });

    await expect(service.refreshToken(orgId, brandId)).rejects.toThrow(
      'Youtube credential not found',
    );
  });

  it('disconnects a credential without a refresh token', async () => {
    const { credentials, service } = setup({
      credentials: [credential({ refreshToken: null })],
    });

    await expect(service.refreshToken(orgId, brandId)).rejects.toThrow(
      'Youtube refresh token not found',
    );
    expect(credentials[0].isConnected).toBe(false);
  });

  it('disconnects a credential whose refresh token cannot be decrypted', async () => {
    const { credentials, service } = setup({
      credentials: [credential({ refreshToken: 'not-a-ciphertext' })],
    });

    await expect(service.refreshToken(orgId, brandId)).rejects.toThrow();
    expect(credentials[0].isConnected).toBe(false);
    expect(credentials[0]).not.toHaveProperty('accessToken');
  });

  it('stores a rotated refresh token', async () => {
    const { credentials, service } = setup({
      grants: new Map([
        [
          REFRESH_TOKEN,
          {
            access_token: 'new-access',
            expiry_date: Date.parse('2026-11-06T14:00:00Z'),
            refresh_token: 'rotated-refresh-token',
          },
        ],
      ]),
    });

    await service.refreshToken(orgId, brandId);

    expect(credentials[0].refreshToken).toBe('rotated-refresh-token');
  });

  it('answers 401 and disconnects when Google revoked the grant', async () => {
    const invalidGrant = Object.assign(new Error('invalid_grant'), {
      response: { data: { error: 'invalid_grant' } },
    });
    const { credentials, service } = setup({ googleError: invalidGrant });

    const failure = await service
      .refreshToken(orgId, brandId)
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(HttpException);
    expect((failure as HttpException).getStatus()).toBe(
      HttpStatus.UNAUTHORIZED,
    );
    expect(credentials[0].isConnected).toBe(false);
  });

  it('rethrows any other refresh failure and disconnects', async () => {
    const { credentials, service } = setup({
      googleError: new Error('Network timeout'),
    });

    await expect(service.refreshToken(orgId, brandId)).rejects.toThrow(
      'Network timeout',
    );
    expect(credentials[0].isConnected).toBe(false);
  });

  it('fails when Google returns no access token', async () => {
    const { credentials, service } = setup({
      grants: new Map([[REFRESH_TOKEN, { access_token: null }]]),
    });

    await expect(service.refreshToken(orgId, brandId)).rejects.toThrow(
      'Failed to obtain access token from refresh',
    );
    expect(credentials[0].isConnected).toBe(false);
    expect(credentials[0]).not.toHaveProperty('accessToken');
  });

  it('warns about a suspiciously short refresh token without logging it', async () => {
    const { service, warnings } = setup({
      credentials: [
        credential({ refreshToken: EncryptionUtil.encrypt('short') }),
      ],
      grants: new Map([['short', { access_token: 'new-access-token' }]]),
    });

    await service.refreshToken(orgId, brandId);

    expect(warnings).toEqual([
      { context: { length: 5 }, message: 'Refresh token seems too short' },
    ]);
  });
});
