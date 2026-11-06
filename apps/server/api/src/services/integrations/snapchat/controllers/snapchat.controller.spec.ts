vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeSingle: (_request: unknown, _serializer: unknown, data: unknown) =>
    data,
}));

import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import type { BrandsService } from '@api/collections/brands/services/brands.service';
import type { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import type { SnapchatService } from '@api/services/integrations/snapchat/services/snapchat.service';
import type { LoggerService } from '@libs/logger/logger.service';
import type { Request } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { SnapchatController } from './snapchat.controller';

vi.mock('@api/helpers/decorators/swagger/auto-swagger.decorator', () => ({
  AutoSwagger: () => () => undefined,
}));

interface StoredCredential {
  accessToken?: string;
  brandId: string;
  id: string;
  isConnected: boolean;
  oauthState: string | null;
  organizationId: string;
  platform: string;
  refreshToken?: string;
  userId: string;
}

/** Snapchat's OAuth server: the codes it accepts and the tokens it issues. */
const SNAPCHAT_TOKENS: Record<
  string,
  { accessToken?: string; refreshToken?: string }
> = {
  'auth-code-123': {
    accessToken: 'snap-access-token',
    refreshToken: 'snap-refresh-token',
  },
  'code-without-token': {},
};

function setup() {
  const brands = [
    { id: 'brand-id', organizationId: 'organization-id', userId: 'user-id' },
  ];
  const credentials: StoredCredential[] = [];

  const brandsService = {
    findOne: async (filter: { id: string; organizationId: string }) =>
      brands.find(
        (brand) =>
          brand.id === filter.id &&
          brand.organizationId === filter.organizationId,
      ) ?? null,
  } as unknown as BrandsService;

  const credentialsService = {
    beginOAuthForBrand: async (
      brand: { id: string; organizationId: string },
      userId: string,
      platform: string,
    ) => {
      const credential: StoredCredential = {
        brandId: brand.id,
        id: `credential-${credentials.length + 1}`,
        isConnected: false,
        oauthState: `state-${credentials.length + 1}`,
        organizationId: brand.organizationId,
        platform,
        userId,
      };
      credentials.push(credential);
      return { credential, state: credential.oauthState };
    },
    findPendingOAuthCredential: async (state: string, platform: string) =>
      credentials.find(
        (credential) =>
          credential.oauthState === state && credential.platform === platform,
      ) ?? null,
    patch: async (id: string, update: Partial<StoredCredential>) => {
      const credential = credentials.find((item) => item.id === id);
      if (!credential) throw new Error(`no credential ${id}`);
      Object.assign(credential, update);
      return { ...credential };
    },
  } as unknown as CredentialsService;

  const snapchatService = {
    exchangeCodeForToken: async (code: string) => {
      const tokens = SNAPCHAT_TOKENS[code];
      if (!tokens) throw new Error('Invalid code');
      return tokens;
    },
    generateAuthUrl: (state: string) =>
      `https://accounts.snapchat.com/oauth2/authorize?state=${state}`,
  } as unknown as SnapchatService;

  const logger = {
    error: () => undefined,
    log: () => undefined,
    warn: () => undefined,
  } as unknown as LoggerService;

  const controller = new SnapchatController(
    snapchatService,
    logger,
    brandsService,
    credentialsService,
  );
  return { controller, credentials };
}

const request = {} as Request;
const user = {
  organizationId: 'organization-id',
  userId: 'user-id',
} as unknown as User;

describe('SnapchatController', () => {
  describe('connect()', () => {
    it('opens a pending credential and returns the auth URL carrying its server-issued state', async () => {
      const { controller, credentials } = setup();

      const result = await controller.connect(request, user, {
        brandId: 'brand-id',
      });

      expect(result).toEqual({
        url: 'https://accounts.snapchat.com/oauth2/authorize?state=state-1',
      });
      expect(credentials).toEqual([
        expect.objectContaining({
          brandId: 'brand-id',
          isConnected: false,
          oauthState: 'state-1',
          platform: 'snapchat',
          userId: 'user-id',
        }),
      ]);
    });

    it('refuses a brand outside the caller organization', async () => {
      const { controller, credentials } = setup();

      await expect(
        controller.connect(
          request,
          { ...user, organizationId: 'other-org' } as User,
          { brandId: 'brand-id' },
        ),
      ).rejects.toMatchObject({ status: 403 });
      expect(credentials).toEqual([]);
    });
  });

  describe('verify()', () => {
    it('stores the exchanged tokens on the pending credential and clears its state', async () => {
      const { controller, credentials } = setup();
      await controller.connect(request, user, { brandId: 'brand-id' });

      const result = await controller.verify(request, {
        code: 'auth-code-123',
        state: 'state-1',
      });

      expect(result).toMatchObject({
        accessToken: 'snap-access-token',
        id: 'credential-1',
        isConnected: true,
        oauthState: null,
        refreshToken: 'snap-refresh-token',
      });
      expect(credentials[0]).toMatchObject({
        accessToken: 'snap-access-token',
        isConnected: true,
        oauthState: null,
      });
    });

    it('rejects a state that no pending credential carries', async () => {
      const { controller } = setup();

      await expect(
        controller.verify(request, { code: 'auth-code-123', state: 'forged' }),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('rejects a callback missing its code or state', async () => {
      const { controller } = setup();

      await expect(
        controller.verify(request, { state: 'state-1' }),
      ).rejects.toMatchObject({ status: 400 });
    });

    it('fails with 502 and leaves the credential pending when Snapchat returns no access token', async () => {
      const { controller, credentials } = setup();
      await controller.connect(request, user, { brandId: 'brand-id' });

      await expect(
        controller.verify(request, {
          code: 'code-without-token',
          state: 'state-1',
        }),
      ).rejects.toMatchObject({ status: 502 });
      expect(credentials[0]).toMatchObject({
        isConnected: false,
        oauthState: 'state-1',
      });
    });

    it('propagates a rejected code and leaves the credential pending', async () => {
      const { controller, credentials } = setup();
      await controller.connect(request, user, { brandId: 'brand-id' });

      await expect(
        controller.verify(request, { code: 'bad-code', state: 'state-1' }),
      ).rejects.toThrow('Invalid code');
      expect(credentials[0]).toMatchObject({ isConnected: false });
    });
  });
});
