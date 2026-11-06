import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import type { BrandsService } from '@api/collections/brands/services/brands.service';
import type { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { FanvueController } from '@api/services/integrations/fanvue/controllers/fanvue.controller';
import type { FanvueService } from '@api/services/integrations/fanvue/services/fanvue.service';
import { CredentialPlatform } from '@genfeedai/contracts';
import { testId } from '@helpers/testing/test-id.helper';
import type { LoggerService } from '@libs/logger/logger.service';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { ServiceUnavailableException } from '@nestjs/common';
import type { Request } from 'express';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@api/helpers/utils/response/response.util', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('@api/helpers/utils/response/response.util')
    >();
  return {
    ...actual,
    serializeSingle: (_req: unknown, _serializer: unknown, data: unknown) => ({
      data,
    }),
  };
});

const orgId = testId('org');
const otherOrgId = testId('org', 2);
const userId = testId('user');
const brandId = 'brand-1';
const user = { organizationId: orgId, userId } as unknown as User;
const request = { headers: {}, url: '/services/fanvue' } as unknown as Request;

interface CredentialRow {
  account?: { handle?: string; id?: string; name?: string };
  brandId: string;
  id: string;
  isConnected: boolean;
  organizationId: string;
  platform: string;
  secrets: Record<string, unknown>;
  state: string;
  userId: string;
}

type ExchangeFailure = Error | { response: { data: Record<string, string> } };

/**
 * The organization's brands and credentials, and Fanvue's OAuth endpoints.
 * Fanvue issues a fixed PKCE pair and exchanges an authorization code only
 * with the verifier whose challenge it was issued for.
 */
function setup({
  configError = null as Error | null,
  exchangeFailure = null as ExchangeFailure | null,
  profileError = null as Error | null,
} = {}) {
  const brands = [
    { id: brandId, organizationId: orgId },
    { id: 'brand-other', organizationId: otherOrgId },
  ];
  const credentials: CredentialRow[] = [];
  const authorizedCodes = new Map([['auth-code-123', 'test-verifier']]);
  const brandsService = {
    findOne: async (where: { id: string; organizationId: string }) =>
      brands.find(
        (brand) =>
          brand.id === where.id &&
          brand.organizationId === where.organizationId,
      ) ?? null,
  };
  const credentialsService = {
    beginOAuthForBrand: async (
      brand: { id: string; organizationId: string },
      ownerId: string,
      platform: string,
      patch: { oauthToken: string },
    ) => {
      const credential: CredentialRow = {
        brandId: brand.id,
        id: `cred-${credentials.length + 1}`,
        isConnected: false,
        organizationId: brand.organizationId,
        platform,
        secrets: { oauthToken: EncryptionUtil.encrypt(patch.oauthToken) },
        state: `state-${credentials.length + 1}`,
        userId: ownerId,
      };
      credentials.push(credential);
      return { credential, state: credential.state };
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
    findPendingOAuthCredential: async (state: string, platform: string) => {
      const row = credentials.find(
        (item) =>
          item.state === state &&
          item.platform === platform &&
          !item.isConnected,
      );
      return row
        ? { id: row.id, organizationId: row.organizationId, ...row.secrets }
        : null;
    },
  };
  const fanvueService = {
    buildAuthUrl: (state: string, challenge: string) =>
      `https://fanvue.com/oauth?state=${state}&code_challenge=${challenge}`,
    exchangeCodeForTokens: async (code: string, verifier: string) => {
      if (exchangeFailure) throw exchangeFailure;
      if (authorizedCodes.get(code) !== verifier) {
        throw { response: { data: { error: 'invalid_grant' } } };
      }
      return {
        access_token: 'fanvue-access-token',
        expires_in: 3600,
        refresh_token: 'fanvue-refresh-token',
        scope:
          'openid offline_access read:self read:media write:media write:post',
      };
    },
    generatePkce: () => ({
      codeChallenge: 'test-challenge',
      codeVerifier: 'test-verifier',
    }),
    getUserProfile: async (accessToken: string) => {
      if (profileError) throw profileError;
      if (accessToken !== 'fanvue-access-token') throw new Error('401');
      return {
        displayName: 'Test Creator',
        handle: 'testcreator',
        uuid: 'fanvue-uuid-1',
      };
    },
    requireConfigured: () => {
      if (configError) throw configError;
    },
  };
  const silent = () => undefined;
  const controller = new FanvueController(
    brandsService as unknown as BrandsService,
    credentialsService as unknown as CredentialsService,
    fanvueService as unknown as FanvueService,
    {
      debug: silent,
      error: silent,
      log: silent,
      warn: silent,
    } as unknown as LoggerService,
  );
  return { controller, credentials };
}

/** Starts the connect flow so a pending Fanvue credential holds the verifier. */
async function connected(options: Parameters<typeof setup>[0] = {}) {
  const harness = setup(options);
  await harness.controller.connect(request, user, { brandId });
  return harness;
}

describe('FanvueController', () => {
  describe('connect', () => {
    it('returns the PKCE auth URL and stores the verifier encrypted on a pending credential', async () => {
      const { controller, credentials } = setup();

      const result = await controller.connect(request, user, { brandId });

      expect(result).toEqual({
        data: {
          url: 'https://fanvue.com/oauth?state=state-1&code_challenge=test-challenge',
        },
      });
      expect(credentials).toEqual([
        expect.objectContaining({
          brandId,
          isConnected: false,
          organizationId: orgId,
          platform: CredentialPlatform.FANVUE,
          userId,
        }),
      ]);
      expect(credentials[0].secrets.oauthToken).not.toBe('test-verifier');
      expect(
        EncryptionUtil.decrypt(credentials[0].secrets.oauthToken as string),
      ).toBe('test-verifier');
    });

    it.each([
      ['missing', 'brand-missing'],
      ['in another organization', 'brand-other'],
    ])('answers 400 for a brand that is %s', async (_name, id) => {
      const { controller, credentials } = setup();

      await expect(
        controller.connect(request, user, { brandId: id }),
      ).rejects.toMatchObject({ status: 400 });
      expect(credentials).toEqual([]);
    });

    it('fails closed before persisting PKCE state when Fanvue is not configured', async () => {
      const { controller, credentials } = setup({
        configError: new ServiceUnavailableException(
          'Fanvue OAuth is not configured for this deployment.',
        ),
      });

      await expect(
        controller.connect(request, user, { brandId }),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(credentials).toEqual([]);
    });
  });

  describe('verify', () => {
    it('exchanges the code with the stored verifier and connects the Fanvue account', async () => {
      const { controller, credentials } = await connected();

      const result = await controller.verify(request, {
        code: 'auth-code-123',
        state: 'state-1',
      });

      expect(result).toEqual({ data: { id: 'cred-1', isConnected: true } });
      expect(credentials[0]).toMatchObject({
        account: {
          handle: 'testcreator',
          id: 'fanvue-uuid-1',
          name: 'Test Creator',
        },
        isConnected: true,
        secrets: {
          accessToken: 'fanvue-access-token',
          accessTokenExpiry: expect.any(Date),
          grantedScopes: [
            'offline_access',
            'openid',
            'read:media',
            'read:self',
            'write:media',
            'write:post',
          ],
          grantedScopesCapturedAt: expect.any(Date),
          oauthToken: null,
          oauthTokenSecret: null,
          refreshToken: 'fanvue-refresh-token',
        },
      });
    });

    it('still connects when the Fanvue profile cannot be read', async () => {
      const { controller, credentials } = await connected({
        profileError: new Error('profile down'),
      });

      await controller.verify(request, {
        code: 'auth-code-123',
        state: 'state-1',
      });

      expect(credentials[0]).toMatchObject({
        account: { handle: undefined, id: undefined, name: undefined },
        isConnected: true,
      });
    });

    it('answers 400 when code or state is missing', async () => {
      const { controller } = await connected();

      await expect(
        controller.verify(request, { code: undefined, state: undefined }),
      ).rejects.toMatchObject({ status: 400 });
    });

    it('answers 404 for an unknown state', async () => {
      const { controller } = await connected();

      await expect(
        controller.verify(request, {
          code: 'auth-code-123',
          state: 'missing-state',
        }),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('answers 400 when the pending credential lost its verifier', async () => {
      const { controller, credentials } = await connected();
      credentials[0].secrets.oauthToken = null;

      await expect(
        controller.verify(request, {
          code: 'auth-code-123',
          state: 'state-1',
        }),
      ).rejects.toMatchObject({ status: 400 });
      expect(credentials[0].isConnected).toBe(false);
    });

    it('answers 400 for a code Fanvue rejects as an invalid grant', async () => {
      const { controller, credentials } = await connected();

      await expect(
        controller.verify(request, {
          code: 'expired-code',
          state: 'state-1',
        }),
      ).rejects.toMatchObject({ status: 400 });
      expect(credentials[0].isConnected).toBe(false);
    });

    it('preserves a sanitized configuration error from token exchange', async () => {
      const { controller } = await connected({
        exchangeFailure: new ServiceUnavailableException(
          'Fanvue OAuth is not configured for this deployment.',
        ),
      });

      await expect(
        controller.verify(request, {
          code: 'auth-code-123',
          state: 'state-1',
        }),
      ).rejects.toMatchObject({
        message: 'Fanvue OAuth is not configured for this deployment.',
      });
    });

    it('answers 500 on an unknown failure', async () => {
      const { controller, credentials } = await connected({
        exchangeFailure: new Error('Network error'),
      });

      await expect(
        controller.verify(request, {
          code: 'auth-code-123',
          state: 'state-1',
        }),
      ).rejects.toMatchObject({ status: 500 });
      expect(credentials[0].isConnected).toBe(false);
    });
  });
});
