import type { CredentialDocument } from '@api/collections/credentials/credential.types';
import { GoogleBusinessApiError } from '@api/services/integrations/google-business/google-business-error.util';
import { GoogleBusinessService } from '@api/services/integrations/google-business/services/google-business.service';
import { ActivityKey } from '@genfeedai/contracts';
import { of, throwError } from 'rxjs';

vi.mock('@libs/utils/encryption/encryption.util', () => ({
  EncryptionUtil: { decrypt: (value: string) => `plain:${value}` },
}));

type RefreshOutcome =
  | { kind: 'ok'; accessToken: string }
  | { kind: 'error'; error: unknown };

const capability = vi.hoisted(() => ({
  status: 'hidden' as 'hidden' | 'supported',
}));

vi.mock(
  '@genfeedai/contracts/api-types/contracts/channel-capabilities.contract',
  async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    getChannelCapability: () => ({ status: capability.status }),
  }),
);

const oauth = vi.hoisted(() => ({
  refresh: null as null | (() => Promise<unknown>),
}));

vi.mock('google-auth-library', () => ({
  OAuth2Client: class {
    credentials: Record<string, unknown> = {};
    generateAuthUrl(options: Record<string, unknown>) {
      return `https://accounts.google.test/auth?${new URLSearchParams(
        Object.entries(options).map(([key, value]) => [key, String(value)]),
      ).toString()}`;
    }
    setCredentials(credentials: Record<string, unknown>) {
      this.credentials = credentials;
    }
    refreshAccessToken() {
      return oauth.refresh?.();
    }
  },
}));

interface HttpCall {
  headers?: Record<string, string>;
  method: string;
  params?: Record<string, unknown>;
  url: string;
}

describe('GoogleBusinessService', () => {
  let calls: HttpCall[];
  let responses: Array<(call: HttpCall) => unknown>;
  let patches: Array<{ id: string; update: Record<string, unknown> }>;
  let activities: Array<Record<string, unknown>>;
  let outcome: RefreshOutcome;
  let service: GoogleBusinessService;

  const credential = (
    overrides: Partial<Record<string, unknown>> = {},
  ): CredentialDocument =>
    ({
      accessToken: 'enc-access',
      accessTokenExpiry: new Date(Date.now() + 60 * 60 * 1000),
      brandId: 'brand-1',
      externalName: 'Corner Cafe',
      id: 'cred-1',
      isConnected: true,
      organizationId: 'org-1',
      refreshToken: 'enc-refresh',
      userId: 'user-1',
      ...overrides,
    }) as unknown as CredentialDocument;

  const apiError = (status: number, message: string) => ({
    response: {
      data: { error: { message, status: `S${status}` } },
      status,
    },
  });

  beforeEach(() => {
    capability.status = 'hidden';
    calls = [];
    responses = [];
    patches = [];
    activities = [];
    outcome = { accessToken: 'new-access', kind: 'ok' };
    oauth.refresh = async () => {
      if (outcome.kind === 'error') {
        throw outcome.error;
      }
      return {
        credentials: {
          access_token: outcome.accessToken,
          expiry_date: Date.now() + 3_600_000,
        },
      };
    };

    service = new GoogleBusinessService(
      {
        get: (key: string) =>
          ({
            GENFEEDAI_APP_URL: 'https://app.genfeed.test/',
            GOOGLE_OAUTH_CLIENT_ID: 'client-id',
            GOOGLE_OAUTH_CLIENT_SECRET: 'client-secret',
          })[key],
      } as never,
      { error: () => {}, log: () => {}, warn: () => {} } as never,
      {
        request: (call: HttpCall) => {
          calls.push(call);
          const next = responses.shift();
          if (!next) {
            throw new Error(`unexpected request ${call.method} ${call.url}`);
          }
          const result = next(call);
          return result instanceof Error
            ? throwError(() => result)
            : result && typeof result === 'object' && 'response' in result
              ? throwError(() => result)
              : of({ data: result });
        },
      } as never,
      {
        record: async (activity: Record<string, unknown>) => {
          activities.push(activity);
        },
      } as never,
      {
        patch: async (id: string, update: Record<string, unknown>) => {
          patches.push({ id, update });
          return { ...credential(), id, ...update };
        },
        resolveBrandAccount: async () => credential(),
      } as never,
    );
  });

  it('asks for offline access to the business scope on the app redirect', () => {
    const url = new URL(service.generateAuthUrl('state-1'));

    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      access_type: 'offline',
      scope: 'https://www.googleapis.com/auth/business.manage',
      state: 'state-1',
    });
    expect(service.getRedirectUri()).toBe(
      'https://app.genfeed.test/oauth/google-business',
    );
  });

  it('lists the locations of every account under the account that owns them', async () => {
    responses = [
      () => ({
        accounts: [{ name: 'accounts/1' }, { name: 'accounts/2' }],
      }),
      () => ({
        locations: [
          {
            name: 'locations/10',
            storefrontAddress: {
              addressLines: ['1 High St'],
              locality: 'Leeds',
              regionCode: 'GB',
            },
            title: 'Corner Cafe',
          },
        ],
      }),
      () => ({
        locations: [{ name: 'locations/20', title: 'Harbour Bakery' }],
      }),
    ];

    const locations = await service.listLocations('token');

    expect(locations).toEqual([
      {
        address: '1 High St, Leeds, GB',
        id: 'accounts/1/locations/10',
        title: 'Corner Cafe',
      },
      {
        address: undefined,
        id: 'accounts/2/locations/20',
        title: 'Harbour Bakery',
      },
    ]);
    expect(calls[1]?.params?.readMask).toBe('name,title,storefrontAddress');
    expect(calls[1]?.headers?.Authorization).toBe('Bearer token');
  });

  it('follows the location listing to its last page', async () => {
    responses = [
      () => ({ accounts: [{ name: 'accounts/1' }] }),
      () => ({
        locations: [{ name: 'locations/10', title: 'One' }],
        nextPageToken: 'p2',
      }),
      () => ({ locations: [{ name: 'locations/11', title: 'Two' }] }),
    ];

    const locations = await service.listLocations('token');

    expect(locations.map((location) => location.id)).toEqual([
      'accounts/1/locations/10',
      'accounts/1/locations/11',
    ]);
    expect(calls[2]?.params?.pageToken).toBe('p2');
  });

  it('creates a post with the stored access token', async () => {
    responses = [
      () => ({
        name: 'accounts/1/locations/10/localPosts/5',
        searchUrl: 'https://g.test/p',
      }),
    ];

    const created = await service.createLocalPost(
      credential(),
      'accounts/1/locations/10',
      { summary: 'Hi', topicType: 'STANDARD' },
    );

    expect(created).toMatchObject({
      name: 'accounts/1/locations/10/localPosts/5',
      searchUrl: 'https://g.test/p',
    });
    expect(calls[0]).toMatchObject({
      headers: { Authorization: 'Bearer plain:enc-access' },
      method: 'POST',
      url: 'https://mybusiness.googleapis.com/v4/accounts/1/locations/10/localPosts',
    });
  });

  it('refreshes a token that is close to expiry before posting', async () => {
    responses = [() => ({ name: 'accounts/1/locations/10/localPosts/5' })];

    await service.createLocalPost(
      credential({ accessTokenExpiry: new Date(Date.now() + 60_000) }),
      'accounts/1/locations/10',
      { summary: 'Hi', topicType: 'STANDARD' },
    );

    expect(patches[0]?.update).toMatchObject({
      accessToken: 'new-access',
      isConnected: true,
    });
  });

  it('refreshes once and posts again when Google refuses the token', async () => {
    responses = [
      () => apiError(401, 'expired'),
      () => ({ name: 'accounts/1/locations/10/localPosts/5' }),
    ];

    const created = await service.createLocalPost(
      credential(),
      'accounts/1/locations/10',
      { summary: 'Hi', topicType: 'STANDARD' },
    );

    expect(created.name).toBe('accounts/1/locations/10/localPosts/5');
    expect(calls).toHaveLength(2);
    expect(patches).toHaveLength(1);
  });

  it('turns a 400 into an error that says the request was rejected', async () => {
    responses = [() => apiError(400, 'summary too long')];

    const failure = await service
      .createLocalPost(credential(), 'accounts/1/locations/10', {
        summary: 'Hi',
        topicType: 'STANDARD',
      })
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(GoogleBusinessApiError);
    expect((failure as GoogleBusinessApiError).isRequestRejected).toBe(true);
    expect((failure as Error).message).toContain('summary too long');
  });

  describe('refreshToken', () => {
    it('disconnects the channel and alerts its owner when Google revoked the grant', async () => {
      outcome = {
        error: { response: { data: { error: 'invalid_grant' } } },
        kind: 'error',
      };

      await expect(
        service.refreshToken('org-1', 'brand-1', 'cred-1'),
      ).rejects.toBeDefined();

      expect(patches).toEqual([
        { id: 'cred-1', update: { isConnected: false } },
      ]);
      expect(activities).toMatchObject([
        {
          brandId: 'brand-1',
          key: ActivityKey.SOCIAL_INTEGRATION_DISCONNECTED,
          organizationId: 'org-1',
        },
      ]);
    });

    it('keeps the channel connected when the refresh fails for another reason', async () => {
      outcome = { error: new Error('socket hang up'), kind: 'error' };

      await expect(
        service.refreshToken('org-1', 'brand-1', 'cred-1'),
      ).rejects.toThrow('socket hang up');

      expect(patches).toEqual([]);
      expect(activities).toEqual([]);
    });

    it('does not alert twice for a channel that is already disconnected', async () => {
      await service.markDisconnected(
        credential({ isConnected: false }),
        new Error('revoked'),
      );

      expect(patches).toEqual([]);
      expect(activities).toEqual([]);
    });
  });
  describe('connect readiness', () => {
    const withConfig = (values: Record<string, string>) =>
      new GoogleBusinessService(
        { get: (key: string) => values[key] } as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
      );
    const configured = {
      GOOGLE_OAUTH_CLIENT_ID: 'client-id',
      GOOGLE_OAUTH_CLIENT_SECRET: 'client-secret',
    };

    it('stays unavailable while the channel is hidden', () => {
      expect(withConfig(configured).getConnectReadiness()).toEqual({
        status: 'unavailable',
      });
    });

    it('is available once the channel is released and the Google client is configured', () => {
      capability.status = 'supported';

      expect(withConfig(configured).getConnectReadiness()).toEqual({
        status: 'available',
      });
    });

    it('stays unavailable without the Google client secret', () => {
      capability.status = 'supported';

      expect(
        withConfig({
          GOOGLE_OAUTH_CLIENT_ID: 'client-id',
        }).getConnectReadiness(),
      ).toEqual({ status: 'unavailable' });
    });
  });
});
