vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeSingle: vi.fn(
    (_request: unknown, _serializer: unknown, data: unknown) => data,
  ),
}));

import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import type { BrandsService } from '@api/collections/brands/services/brands.service';
import type { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { DiscordController } from '@api/services/integrations/discord/controllers/discord.controller';
import type { DiscordService } from '@api/services/integrations/discord/services/discord.service';
import { CredentialPlatform } from '@genfeedai/contracts';
import { HttpException } from '@nestjs/common';
import type { Request } from 'express';

interface StoredBrand {
  id: string;
  organizationId: string;
}

interface PendingCredential {
  id: string;
  organizationId: string;
  platform: CredentialPlatform;
  state: string;
  userId: string;
}

interface ConnectedAccount {
  account: {
    avatarUrl?: string;
    handle: string;
    id: string;
    name: string;
  };
  credentialId: string;
  organizationId: string;
  tokens: {
    accessToken: string;
    accessTokenExpiry?: Date;
    refreshToken?: string;
  };
}

interface DiscordProfile {
  avatar?: string;
  global_name?: string;
  id: string;
  username: string;
}

describe('DiscordController', () => {
  const orgId = 'org-1';
  const brandId = 'brand-1';
  const user = { organizationId: orgId, userId: 'user-1' } as unknown as User;
  const request = {} as Request;

  let brands: StoredBrand[];
  let pending: PendingCredential[];
  let connected: ConnectedAccount[];
  let exchangedCodes: string[];
  let tokenResponse: {
    access_token?: string;
    expires_in?: number;
    refresh_token?: string;
  };
  let profile: DiscordProfile;
  let controller: DiscordController;

  beforeEach(() => {
    brands = [{ id: brandId, organizationId: orgId }];
    pending = [];
    connected = [];
    exchangedCodes = [];
    tokenResponse = {
      access_token: 'access-token',
      expires_in: 604800,
      refresh_token: 'refresh-token',
    };
    profile = {
      avatar: 'avatar-hash',
      global_name: 'Test User',
      id: '123456',
      username: 'testuser',
    };

    const discordService = {
      exchangeCodeForToken: async (code: string) => {
        exchangedCodes.push(code);
        return tokenResponse;
      },
      generateAuthUrl: (state: string) =>
        `https://discord.com/oauth2/authorize?state=${state}`,
      getUserInfo: async (accessToken: string) => {
        if (accessToken !== tokenResponse.access_token) {
          throw new Error('unexpected token');
        }
        return profile;
      },
    };

    const credentialsService = {
      beginOAuthForBrand: async (
        brand: StoredBrand,
        userId: string,
        platform: CredentialPlatform,
      ) => {
        const credential = {
          id: `cred-${pending.length + 1}`,
          organizationId: brand.organizationId,
          platform,
          state: `state-${pending.length + 1}`,
          userId,
        };
        pending.push(credential);
        return { credential: { id: credential.id }, state: credential.state };
      },
      connectAccount: async (
        credentialId: string,
        organizationId: string,
        account: ConnectedAccount['account'],
        tokens: ConnectedAccount['tokens'],
      ) => {
        connected.push({ account, credentialId, organizationId, tokens });
        return { id: credentialId, isConnected: true };
      },
      findPendingOAuthCredential: async (
        state: string,
        platform: CredentialPlatform,
        scope: { organizationId: string; userId: string },
      ) =>
        pending.find(
          (credential) =>
            credential.state === state &&
            credential.platform === platform &&
            credential.organizationId === scope.organizationId &&
            credential.userId === scope.userId,
        ) ?? null,
    };

    const brandsService = {
      findOne: async (where: StoredBrand) =>
        brands.find(
          (brand) =>
            brand.id === where.id &&
            brand.organizationId === where.organizationId,
        ) ?? null,
    };

    controller = new DiscordController(
      discordService as unknown as DiscordService,
      credentialsService as unknown as CredentialsService,
      brandsService as unknown as BrandsService,
    );
  });

  describe('connect', () => {
    it('starts OAuth for a brand in the authenticated organization', async () => {
      const result = await controller.connect(request, user, brandId);

      expect(result).toEqual({
        url: 'https://discord.com/oauth2/authorize?state=state-1',
      });
      expect(pending).toEqual([
        {
          id: 'cred-1',
          organizationId: orgId,
          platform: CredentialPlatform.DISCORD,
          state: 'state-1',
          userId: 'user-1',
        },
      ]);
    });

    it('rejects a brand outside the authenticated organization', async () => {
      brands = [{ id: brandId, organizationId: 'org-2' }];

      await expect(controller.connect(request, user, brandId)).rejects.toThrow(
        HttpException,
      );

      expect(pending).toEqual([]);
    });
  });

  describe('verify', () => {
    beforeEach(async () => {
      await controller.connect(request, user, brandId);
    });

    it('connects the Discord account behind the pending credential', async () => {
      const result = await controller.verify(
        request,
        user,
        'auth-code',
        'state-1',
      );

      expect(result).toEqual({ id: 'cred-1', isConnected: true });
      expect(exchangedCodes).toEqual(['auth-code']);
      expect(connected).toEqual([
        {
          account: {
            avatarUrl:
              'https://cdn.discordapp.com/avatars/123456/avatar-hash.png',
            handle: 'testuser',
            id: '123456',
            name: 'Test User',
          },
          credentialId: 'cred-1',
          organizationId: orgId,
          tokens: {
            accessToken: 'access-token',
            accessTokenExpiry: expect.any(Date),
            refreshToken: 'refresh-token',
          },
        },
      ]);
    });

    it('falls back to the username and no avatar when Discord has neither', async () => {
      profile = { id: '999', username: 'user' };

      await controller.verify(request, user, 'code', 'state-1');

      expect(connected[0]?.account).toEqual({
        avatarUrl: undefined,
        handle: 'user',
        id: '999',
        name: 'user',
      });
    });

    it.each([
      ['an unknown state', user, 'bad-state'],
      [
        'another member’s state',
        { organizationId: orgId, userId: 'user-2' } as unknown as User,
        'state-1',
      ],
    ])('refuses %s without calling Discord', async (_case, caller, state) => {
      await expect(
        controller.verify(request, caller, 'code', state),
      ).rejects.toThrow(HttpException);

      expect(exchangedCodes).toEqual([]);
      expect(connected).toEqual([]);
    });

    it('refuses when Discord returns no access token', async () => {
      tokenResponse = {};

      await expect(
        controller.verify(request, user, 'code', 'state-1'),
      ).rejects.toMatchObject({ status: 502 });

      expect(connected).toEqual([]);
    });
  });
});
