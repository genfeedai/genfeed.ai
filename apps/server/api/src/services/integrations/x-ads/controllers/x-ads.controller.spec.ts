vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeSingle: (
    _request: unknown,
    _serializer: unknown,
    data: unknown,
  ) => ({
    data,
  }),
}));

import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import type { BrandsService } from '@api/collections/brands/services/brands.service';
import type { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { XAdsController } from '@api/services/integrations/x-ads/controllers/x-ads.controller';
import type { XAdsService } from '@api/services/integrations/x-ads/services/x-ads.service';
import type { XAdsOAuthService } from '@api/services/integrations/x-ads/services/x-ads-oauth.service';
import { CredentialPlatform } from '@genfeedai/contracts';
import type { LoggerService } from '@libs/logger/logger.service';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import {
  HttpException,
  HttpStatus,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Request } from 'express';

interface AdAccount {
  approvalStatus: string;
  currency: string;
  id: string;
  name: string;
  timezone: string;
}

const recordedAccountFixtures: Record<string, AdAccount[]> = {
  multiple: [
    {
      approvalStatus: 'ACCEPTED',
      currency: 'USD',
      id: 'account-z',
      name: 'Last by id',
      timezone: 'UTC',
    },
    {
      approvalStatus: 'ACCEPTED',
      currency: 'EUR',
      id: 'account-a',
      name: 'First by id',
      timezone: 'Europe/Malta',
    },
  ],
  one: [
    {
      approvalStatus: 'ACCEPTED',
      currency: 'USD',
      id: 'account-1',
      name: 'Primary X Ads account',
      timezone: 'UTC',
    },
  ],
  zero: [],
};

interface CredentialRow {
  account?: { handle: string; id: string; name: string };
  brandId: string;
  id: string;
  isConnected: boolean;
  organizationId: string;
  platform: string;
  secrets: Record<string, unknown>;
  userId: string;
}

const user = {
  id: 'user-1',
  organizationId: 'org-1',
  userId: 'user-1',
} as unknown as User;
const request = {} as Request;

/**
 * The organization's brands and credentials, and X's OAuth 1.0a and Ads
 * account endpoints. X issues one request token per auth link and exchanges
 * it only with its own secret and the verifier it handed the user.
 */
function setup({
  accounts = recordedAccountFixtures.one,
  authLinkError = null as Error | null,
  exchangeError = null as Error | null,
} = {}) {
  const brands = [
    { id: 'brand-1', isDeleted: false, organizationId: 'org-1' },
    { id: 'brand-deleted', isDeleted: true, organizationId: 'org-1' },
    { id: 'brand-other', isDeleted: false, organizationId: 'org-2' },
  ];
  const credentials: CredentialRow[] = [];
  const issuedTokens = new Map([['request-token', 'request-token-secret']]);
  const brandsService = {
    findOne: async (where: {
      id: string;
      isDeleted: boolean;
      organizationId: string;
    }) =>
      brands.find(
        (brand) =>
          brand.id === where.id &&
          brand.isDeleted === where.isDeleted &&
          brand.organizationId === where.organizationId,
      ) ?? null,
  };
  const credentialsService = {
    attachOAuth1RequestToken: async (
      id: string,
      platform: string,
      owner: { organizationId: string; userId: string },
      oauthToken: string,
      oauthTokenSecret: string,
    ) => {
      const row = credentials.find(
        (item) =>
          item.id === id &&
          item.platform === platform &&
          item.organizationId === owner.organizationId,
      );
      if (!row) throw new Error('credential not found');
      row.secrets = {
        oauthToken: EncryptionUtil.encrypt(oauthToken),
        oauthTokenHash: `hash:${oauthToken}`,
        oauthTokenSecret: EncryptionUtil.encrypt(oauthTokenSecret),
      };
      return row;
    },
    beginOAuthForBrand: async (
      brand: { id: string; organizationId: string },
      userId: string,
      platform: string,
    ) => {
      const credential: CredentialRow = {
        brandId: brand.id,
        id: `credential-${credentials.length + 1}`,
        isConnected: false,
        organizationId: brand.organizationId,
        platform,
        secrets: {},
        userId,
      };
      credentials.push(credential);
      return { credential, state: 'opaque-state' };
    },
    connectAccount: async (
      id: string,
      organizationId: string,
      account: CredentialRow['account'],
      secrets: Record<string, unknown>,
    ) => {
      const row = credentials.find(
        (item) => item.id === id && item.organizationId === organizationId,
      );
      if (!row) throw new Error('credential not found');
      Object.assign(row, { account, isConnected: true, secrets });
      return { id: row.id, isConnected: true };
    },
    findPendingOAuth1Credential: async (
      oauthToken: string,
      platform: string,
      owner: { organizationId: string; userId: string },
    ) => {
      const row = credentials.find(
        (item) =>
          item.secrets.oauthTokenHash === `hash:${oauthToken}` &&
          item.platform === platform &&
          item.organizationId === owner.organizationId &&
          item.userId === owner.userId,
      );
      return row
        ? { id: row.id, ...row.secrets, organizationId: row.organizationId }
        : null;
    },
  };
  const xAdsOAuthService = {
    exchangeRequestToken: async (
      token: string,
      secret: string,
      verifier: string,
    ) => {
      if (exchangeError) throw exchangeError;
      if (issuedTokens.get(token) !== secret || verifier !== 'oauth-verifier') {
        throw new Error('401 from X');
      }
      return {
        accessToken: 'access-token',
        accessTokenSecret: 'access-token-secret',
        screenName: 'ads-operator',
        userId: 'x-user-1',
      };
    },
    generateAuthLink: async () => {
      if (authLinkError) throw authLinkError;
      return {
        oauthToken: 'request-token',
        oauthTokenSecret: 'request-token-secret',
        url: 'https://api.x.com/oauth/authorize?oauth_token=request-token',
      };
    },
  };
  const xAdsService = {
    getAdAccounts: async (tokens: {
      accessToken: string;
      accessTokenSecret: string;
    }) =>
      tokens.accessToken === 'access-token' &&
      tokens.accessTokenSecret === 'access-token-secret'
        ? accounts
        : [],
  };
  const silent = () => undefined;
  const controller = new XAdsController(
    brandsService as unknown as BrandsService,
    credentialsService as unknown as CredentialsService,
    { error: silent, log: silent, warn: silent } as unknown as LoggerService,
    xAdsOAuthService as unknown as XAdsOAuthService,
    xAdsService as unknown as XAdsService,
  );
  return { controller, credentials };
}

/** Starts the connect flow so a pending X Ads credential holds the request token. */
async function connected(options: Parameters<typeof setup>[0] = {}) {
  const harness = setup(options);
  await harness.controller.connect(request, user, { brandId: 'brand-1' });
  return harness;
}

const verifyBody = {
  oauthToken: 'request-token',
  oauthVerifier: 'oauth-verifier',
};

const statusOf = (failure: unknown) => (failure as HttpException).getStatus();

describe('XAdsController', () => {
  describe('connect', () => {
    it('returns the X auth link and stores the request token encrypted on a pending X Ads credential', async () => {
      const { controller, credentials } = setup();

      const result = await controller.connect(request, user, {
        brandId: 'brand-1',
      });

      expect(result).toEqual({
        data: {
          url: 'https://api.x.com/oauth/authorize?oauth_token=request-token',
        },
      });
      expect(credentials).toEqual([
        expect.objectContaining({
          brandId: 'brand-1',
          isConnected: false,
          organizationId: 'org-1',
          platform: CredentialPlatform.X_ADS,
          userId: 'user-1',
        }),
      ]);
      expect(credentials[0].secrets.oauthToken).not.toBe('request-token');
      expect(
        EncryptionUtil.decrypt(
          credentials[0].secrets.oauthTokenSecret as string,
        ),
      ).toBe('request-token-secret');
    });

    it.each([
      ['deleted', 'brand-deleted'],
      ['in another organization', 'brand-other'],
    ])('refuses a brand that is %s', async (_name, brandId) => {
      const { controller, credentials } = setup();

      const failure = await controller
        .connect(request, user, { brandId })
        .catch((error: unknown) => error);

      expect(statusOf(failure)).toBe(HttpStatus.FORBIDDEN);
      expect(credentials).toEqual([]);
    });

    it('preserves a typed unavailable response when OAuth is not configured, leaving no pending row', async () => {
      const { controller, credentials } = setup({
        authLinkError: new ServiceUnavailableException(
          'X Ads OAuth is not configured',
        ),
      });

      const failure = await controller
        .connect(request, user, { brandId: 'brand-1' })
        .catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(ServiceUnavailableException);
      expect(statusOf(failure)).toBe(HttpStatus.SERVICE_UNAVAILABLE);
      expect(credentials).toEqual([]);
    });

    it('keeps unexpected OAuth initialization errors behind the generic response', async () => {
      const { controller } = setup({
        authLinkError: new Error('provider details'),
      });

      const failure = await controller
        .connect(request, user, { brandId: 'brand-1' })
        .catch((error: unknown) => error);

      expect(statusOf(failure)).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(
        JSON.stringify((failure as HttpException).getResponse()),
      ).not.toContain('provider details');
    });
  });

  describe('verify', () => {
    it('connects the pending credential to the X Ads account and clears the request token', async () => {
      const { controller, credentials } = await connected();

      const result = await controller.verify(request, user, verifyBody);

      expect(result).toEqual({
        data: { id: 'credential-1', isConnected: true },
      });
      expect(credentials[0]).toMatchObject({
        account: {
          handle: 'Primary X Ads account',
          id: 'account-1',
          name: 'Primary X Ads account',
        },
        isConnected: true,
        secrets: {
          accessToken: 'access-token',
          accessTokenSecret: 'access-token-secret',
          oauthToken: null,
          oauthTokenHash: null,
          oauthTokenSecret: null,
        },
      });
    });

    it.each([
      ['an unknown request token', user, 'organic-x-request-token'],
      [
        'another organization',
        { ...user, organizationId: 'org-2' } as User,
        'request-token',
      ],
      [
        'another user',
        { ...user, id: 'user-2', userId: 'user-2' } as User,
        'request-token',
      ],
    ])(
      'never resolves a pending credential for %s',
      async (_name, caller, oauthToken) => {
        const { controller, credentials } = await connected();

        const failure = await controller
          .verify(request, caller, { ...verifyBody, oauthToken })
          .catch((error: unknown) => error);

        expect(statusOf(failure)).toBe(HttpStatus.BAD_REQUEST);
        expect(credentials[0].isConnected).toBe(false);
      },
    );

    it('rejects a callback without the OAuth 1.0a parameters', async () => {
      const { controller } = await connected();

      const failure = await controller
        .verify(request, user, { oauthToken: 'request-token' })
        .catch((error: unknown) => error);

      expect(statusOf(failure)).toBe(HttpStatus.BAD_REQUEST);
    });

    it('fails verification without connecting when X returns no ad account', async () => {
      const { controller, credentials } = await connected({
        accounts: recordedAccountFixtures.zero,
      });

      const failure = await controller
        .verify(request, user, verifyBody)
        .catch((error: unknown) => error);

      expect(statusOf(failure)).toBe(HttpStatus.BAD_GATEWAY);
      expect(credentials[0].isConnected).toBe(false);
    });

    it('selects multiple X Ads accounts deterministically by account id', async () => {
      const { controller, credentials } = await connected({
        accounts: recordedAccountFixtures.multiple,
      });

      await controller.verify(request, user, verifyBody);

      expect(credentials[0].account).toEqual({
        handle: 'First by id',
        id: 'account-a',
        name: 'First by id',
      });
    });

    it('maps request-token decryption failure without leaking ciphertext details', async () => {
      const { controller, credentials } = await connected();
      credentials[0].secrets.oauthTokenSecret = 'corrupted ciphertext payload';

      const failure = await controller
        .verify(request, user, verifyBody)
        .catch((error: unknown) => error);

      expect(statusOf(failure)).toBe(HttpStatus.BAD_GATEWAY);
      expect(
        JSON.stringify((failure as HttpException).getResponse()),
      ).not.toContain('ciphertext');
      expect(credentials[0].isConnected).toBe(false);
    });

    it('maps raw provider verification errors to a stable client response', async () => {
      const { controller, credentials } = await connected({
        exchangeError: new Error('provider request headers and token details'),
      });

      const failure = await controller
        .verify(request, user, verifyBody)
        .catch((error: unknown) => error);

      expect(statusOf(failure)).toBe(HttpStatus.BAD_GATEWAY);
      expect(
        JSON.stringify((failure as HttpException).getResponse()),
      ).not.toContain('provider request headers and token details');
      expect(credentials[0].isConnected).toBe(false);
    });
  });
});
