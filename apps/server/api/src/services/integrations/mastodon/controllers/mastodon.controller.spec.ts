vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeSingle: vi.fn(
    (_request: unknown, _serializer: unknown, data: unknown) => data,
  ),
}));

vi.mock('@libs/utils/encryption/encryption.util', () => ({
  EncryptionUtil: { decrypt: vi.fn((value: string) => `decrypted:${value}`) },
}));

import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import type { BrandsService } from '@api/collections/brands/services/brands.service';
import type { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { MastodonController } from '@api/services/integrations/mastodon/controllers/mastodon.controller';
import type { MastodonService } from '@api/services/integrations/mastodon/services/mastodon.service';
import { CredentialPlatform } from '@genfeedai/contracts';
import type { ConfigService } from '@libs/config/config.service';
import type { LoggerService } from '@libs/logger/logger.service';
import type { Request } from 'express';

type Row = Record<string, unknown>;

describe('MastodonController', () => {
  const request = {} as Request;
  const user = {
    organizationId: 'organization-id',
    userId: 'user-id',
  } as unknown as User;
  const redirectUri = 'https://app.genfeed.ai/oauth/mastodon';

  let brands: Row[];
  let credentials: Row[];
  let registrations: Array<{ instanceUrl: string; redirectUri: string }>;
  let exchanges: unknown[][];
  let accessToken: string | undefined;
  let controller: MastodonController;

  beforeEach(() => {
    brands = [
      { id: 'brand-id', organizationId: 'organization-id', userId: 'user-id' },
    ];
    credentials = [];
    registrations = [];
    exchanges = [];
    accessToken = 'mastodon-token';

    const mastodonService = {
      exchangeCodeForToken: async (...args: unknown[]) => {
        exchanges.push(args);
        return { accessToken };
      },
      generateAuthUrl: (
        instanceUrl: string,
        clientId: string,
        uri: string,
        state: string,
      ) =>
        `https://${instanceUrl}/oauth/authorize?client_id=${clientId}&redirect_uri=${uri}&state=${state}`,
      registerApp: async (instanceUrl: string, uri: string) => {
        registrations.push({ instanceUrl, redirectUri: uri });
        return {
          client_id: 'client-id',
          client_secret: 'client-secret',
          id: 'app-id',
          name: 'Genfeed.ai',
          redirect_uri: uri,
        };
      },
      verifyCredentials: async (instanceUrl: string, token: string) => {
        if (instanceUrl !== 'mastodon.social' || token !== 'mastodon-token') {
          throw new Error('unexpected verify call');
        }
        return {
          acct: 'creator@mastodon.social',
          avatar: 'https://mastodon.social/avatar.png',
          display_name: 'Creator',
          id: 'mastodon-user',
          username: 'creator',
        };
      },
    };

    const credentialsService = {
      beginOAuthForBrand: async (
        brand: Row,
        userId: string,
        platform: CredentialPlatform,
        fields: Row,
      ) => {
        const credential = {
          ...fields,
          brandId: brand.id,
          id: `credential-${credentials.length + 1}`,
          oauthState: `state-${credentials.length + 1}`,
          organizationId: brand.organizationId,
          platform,
          userId,
        };
        credentials.push(credential);
        return { credential, state: credential.oauthState };
      },
      findPendingOAuthCredential: async (
        state: string,
        platform: CredentialPlatform,
      ) =>
        credentials.find(
          (row) => row.oauthState === state && row.platform === platform,
        ) ?? null,
      patch: async (id: string, update: Row) => {
        const index = credentials.findIndex((row) => row.id === id);
        credentials[index] = { ...(credentials[index] as Row), ...update };
        return credentials[index];
      },
      updateExternalProfile: async (
        id: string,
        organizationId: string,
        profile: Row,
      ) => {
        const index = credentials.findIndex(
          (row) => row.id === id && row.organizationId === organizationId,
        );
        credentials[index] = {
          ...(credentials[index] as Row),
          externalProfile: profile,
        };
        return credentials[index];
      },
    };

    controller = new MastodonController(
      mastodonService as unknown as MastodonService,
      { log: () => undefined } as unknown as LoggerService,
      { get: () => 'https://app.genfeed.ai/' } as unknown as ConfigService,
      {
        findOne: async (where: Row) =>
          brands.find(
            (brand) =>
              brand.id === where.id &&
              brand.organizationId === where.organizationId,
          ) ?? null,
      } as unknown as BrandsService,
      credentialsService as unknown as CredentialsService,
    );
  });

  it('registers the instance app and starts credential-bound OAuth', async () => {
    const result = await controller.connect(request, user, {
      brandId: 'brand-id',
      instanceUrl: 'mastodon.social',
    });

    expect(registrations).toEqual([
      { instanceUrl: 'mastodon.social', redirectUri },
    ]);
    expect(credentials).toEqual([
      expect.objectContaining({
        brandId: 'brand-id',
        description: 'mastodon.social',
        isConnected: false,
        oauthToken: 'client-id',
        oauthTokenSecret: 'client-secret',
        platform: CredentialPlatform.MASTODON,
        userId: 'user-id',
      }),
    ]);
    expect(result).toEqual({
      url: `https://mastodon.social/oauth/authorize?client_id=client-id&redirect_uri=${redirectUri}&state=state-1`,
    });
  });

  it('refuses a brand outside the organization without registering an app', async () => {
    brands = [{ id: 'brand-id', organizationId: 'other-org' }];

    await expect(
      controller.connect(request, user, {
        brandId: 'brand-id',
        instanceUrl: 'mastodon.social',
      }),
    ).rejects.toMatchObject({ status: 403 });
    expect(registrations).toEqual([]);
    expect(credentials).toEqual([]);
  });

  describe('verify', () => {
    beforeEach(async () => {
      await controller.connect(request, user, {
        brandId: 'brand-id',
        instanceUrl: 'mastodon.social',
      });
    });

    it('exchanges the code and persists the verified account', async () => {
      const result = await controller.verify(request, {
        code: 'auth-code',
        state: 'state-1',
      });

      expect(exchanges).toEqual([
        [
          'mastodon.social',
          'decrypted:client-id',
          'decrypted:client-secret',
          'auth-code',
          redirectUri,
        ],
      ]);
      expect(result).toEqual(
        expect.objectContaining({
          accessToken: 'mastodon-token',
          externalProfile: {
            avatarUrl: 'https://mastodon.social/avatar.png',
            bannerUrl: undefined,
            handle: 'creator@mastodon.social',
            id: 'mastodon-user',
            name: 'Creator',
          },
          id: 'credential-1',
          isConnected: true,
          oauthState: null,
          oauthToken: null,
          oauthTokenSecret: null,
        }),
      );
    });

    it('answers 404 for an unknown state without calling Mastodon', async () => {
      await expect(
        controller.verify(request, { code: 'auth-code', state: 'unknown' }),
      ).rejects.toMatchObject({ status: 404 });
      expect(exchanges).toEqual([]);
    });

    it('keeps the credential pending when Mastodon returns no token', async () => {
      accessToken = undefined;

      await expect(
        controller.verify(request, { code: 'auth-code', state: 'state-1' }),
      ).rejects.toMatchObject({ status: 502 });
      expect(credentials[0]).toEqual(
        expect.objectContaining({
          isConnected: false,
          oauthToken: 'client-id',
        }),
      );
    });
  });
});
