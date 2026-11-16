vi.mock('@api/helpers/utils/response/response.util', () => ({
  returnBadRequest: vi.fn((payload: Record<string, string>) => ({
    errors: [payload],
  })),
  serializeSingle: vi.fn(
    (_req: unknown, _serializer: unknown, data: unknown) => ({ data }),
  ),
}));

vi.mock('@libs/utils/encryption/encryption.util', () => ({
  EncryptionUtil: { decrypt: (value: string) => value.replace(/^enc:/, '') },
}));

import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { BlueskyController } from '@api/services/integrations/bluesky/controllers/bluesky.controller';
import { BlueskyService } from '@api/services/integrations/bluesky/services/bluesky.service';
import { BlueskyOAuthService } from '@api/services/integrations/bluesky/services/bluesky-oauth.service';
import { LoggerService } from '@libs/logger/logger.service';
import type { HttpException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Request } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const brand = { id: 'brand-1', organizationId: 'org-1' };
const user = { organizationId: 'org-1', userId: 'user-1' } as unknown as User;
const request = {} as Request;

const SAVED_STATE = { iss: 'https://bsky.social', verifier: 'v' };
const SAVED_SESSION = { tokenSet: { sub: 'did:plc:abc123' } };

interface BeganOAuth {
  fields: Record<string, unknown>;
  reconnectCredentialId: string | undefined;
}

interface ConnectedAccount {
  account: Record<string, unknown>;
  connection: Record<string, unknown>;
  credentialId: string;
  organizationId: string;
}

describe('BlueskyController', () => {
  let controller: BlueskyController;
  let authorizedInputs: string[];
  let began: BeganOAuth[];
  let patches: Array<{ id: string; update: Record<string, unknown> }>;
  let connected: ConnectedAccount[];
  let completedParams: URLSearchParams[];
  let pendingByState: Record<string, unknown>;
  let existingAccount: Record<string, unknown> | null;
  let completeFailure: Error | null;
  let beginFailure: Error | null;
  let findBrand: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    authorizedInputs = [];
    began = [];
    patches = [];
    connected = [];
    completedParams = [];
    pendingByState = {};
    existingAccount = null;
    completeFailure = null;
    beginFailure = null;
    findBrand = vi.fn().mockResolvedValue(brand);

    const module = await Test.createTestingModule({
      controllers: [BlueskyController],
      providers: [
        {
          provide: BlueskyService,
          useValue: {
            getPublicProfile: vi.fn().mockResolvedValue({
              avatar: 'https://cdn.bsky.app/avatar.jpg',
              displayName: 'Alice',
              handle: 'alice.bsky.social',
            }),
          },
        },
        {
          provide: BlueskyOAuthService,
          useValue: {
            beginAuthorization: async (input: string) => {
              authorizedInputs.push(input);
              if (beginFailure) {
                throw beginFailure;
              }
              return {
                authorizationUrl: 'https://bsky.social/oauth/authorize?x=1',
                savedState: SAVED_STATE,
                state: 'library-state',
              };
            },
            completeAuthorization: async (params: URLSearchParams) => {
              completedParams.push(params);
              if (completeFailure) {
                throw completeFailure;
              }
              return {
                audience: 'https://pds.example.com',
                did: 'did:plc:abc123',
                savedSession: SAVED_SESSION,
              };
            },
            getClientMetadata: async () => ({
              client_id: 'https://api/x.json',
            }),
          },
        },
        { provide: BrandsService, useValue: { findOne: findBrand } },
        {
          provide: CredentialsService,
          useValue: {
            beginOAuthForBrand: async (
              _brand: unknown,
              _userId: string,
              _platform: string,
              fields: Record<string, unknown>,
              reconnectCredentialId?: string,
            ) => {
              began.push({ fields, reconnectCredentialId });
              return { credential: { id: 'pending-1' }, state: 'our-state' };
            },
            connectAccount: async (
              credentialId: string,
              organizationId: string,
              account: Record<string, unknown>,
              connection: Record<string, unknown>,
            ) => {
              connected.push({
                account,
                connection,
                credentialId,
                organizationId,
              });
              return { id: credentialId, platform: 'BLUESKY' };
            },
            findOne: async () => existingAccount,
            findPendingOAuthCredential: async (state: string) =>
              pendingByState[state] ?? null,
            patch: async (id: string, update: Record<string, unknown>) => {
              patches.push({ id, update });
              return { id };
            },
          },
        },
        {
          provide: LoggerService,
          useValue: { error: vi.fn(), log: vi.fn(), warn: vi.fn() },
        },
      ],
    }).compile();
    controller = module.get(BlueskyController);
  });

  async function statusOf(promise: Promise<unknown>): Promise<number> {
    try {
      await promise;
      return 200;
    } catch (error: unknown) {
      return (error as HttpException).getStatus();
    }
  }

  describe('client metadata', () => {
    it('serves the document the OAuth client publishes', async () => {
      expect(await controller.clientMetadata()).toEqual({
        client_id: 'https://api/x.json',
      });
    });
  });

  describe('connect', () => {
    it('refuses a brand the caller cannot use', async () => {
      findBrand.mockResolvedValue(null);

      expect(
        await statusOf(
          controller.connect(request, user, { brandId: 'brand-9' }),
        ),
      ).toBe(403);
      expect(began).toEqual([]);
    });

    it('sends a new connection to the Bluesky-hosted sign-in and keeps its state', async () => {
      const result = await controller.connect(request, user, {
        brandId: 'brand-1',
      });

      expect(result).toEqual({
        data: { url: 'https://bsky.social/oauth/authorize?x=1' },
      });
      expect(authorizedInputs).toEqual(['https://bsky.social']);
      expect(began).toEqual([
        {
          fields: {
            isConnected: false,
            oauthTokenSecret: JSON.stringify(SAVED_STATE),
          },
          reconnectCredentialId: undefined,
        },
      ]);
      // The callback carries Bluesky's own state, so that is what is searchable.
      expect(patches).toEqual([
        { id: 'pending-1', update: { oauthState: 'library-state' } },
      ]);
    });

    it('opens a reconnect on the saved account', async () => {
      existingAccount = { externalId: 'did:plc:abc123', id: 'credential-1' };

      await controller.connect(request, user, {
        brandId: 'brand-1',
        credentialId: 'credential-1',
      });

      expect(authorizedInputs).toEqual(['did:plc:abc123']);
      expect(began[0].reconnectCredentialId).toBe('credential-1');
    });

    it('answers a bad gateway when Bluesky cannot be reached', async () => {
      beginFailure = new Error('offline');

      expect(
        await statusOf(
          controller.connect(request, user, { brandId: 'brand-1' }),
        ),
      ).toBe(502);
      expect(began).toEqual([]);
    });
  });

  describe('verify', () => {
    beforeEach(() => {
      pendingByState['library-state'] = {
        id: 'pending-1',
        isConnected: false,
        oauthTokenSecret: `enc:${JSON.stringify(SAVED_STATE)}`,
        organizationId: 'org-1',
      };
    });

    it('connects the account Bluesky authorized and saves its session', async () => {
      const result = await controller.verify(request, {
        code: 'code-1',
        iss: 'https://bsky.social',
        state: 'library-state',
      });

      expect(result).toEqual({
        data: { id: 'pending-1', platform: 'BLUESKY' },
      });
      expect(connected).toEqual([
        {
          account: {
            avatarUrl: 'https://cdn.bsky.app/avatar.jpg',
            bannerUrl: undefined,
            handle: 'alice.bsky.social',
            id: 'did:plc:abc123',
            name: 'Alice',
          },
          connection: {
            accessToken: JSON.stringify(SAVED_SESSION),
            description: 'https://pds.example.com',
            isConnected: true,
            isDeleted: false,
            oauthState: null,
            oauthTokenSecret: null,
          },
          credentialId: 'pending-1',
          organizationId: 'org-1',
        },
      ]);
    });

    it('hands Bluesky the callback it sent, including the issuer', async () => {
      await controller.verify(request, {
        code: 'code-1',
        iss: 'https://bsky.social',
        state: 'library-state',
      });

      expect(Object.fromEntries(completedParams[0])).toEqual({
        code: 'code-1',
        iss: 'https://bsky.social',
        state: 'library-state',
      });
    });

    it('records a refusal at Bluesky instead of connecting', async () => {
      expect(
        await statusOf(
          controller.verify(request, {
            error: 'access_denied',
            state: 'library-state',
          }),
        ),
      ).toBeGreaterThanOrEqual(400);
      expect(connected).toEqual([]);
    });

    it('needs a code and a state', async () => {
      expect(await statusOf(controller.verify(request, { state: 's' }))).toBe(
        400,
      );
      expect(await statusOf(controller.verify(request, { code: 'c' }))).toBe(
        400,
      );
    });

    it('does not accept a state it never issued', async () => {
      expect(
        await statusOf(
          controller.verify(request, { code: 'c', state: 'unknown' }),
        ),
      ).toBe(400);
      expect(connected).toEqual([]);
    });

    it('does not connect when Bluesky rejects the callback', async () => {
      completeFailure = new Error('Issuer mismatch');

      expect(
        await statusOf(
          controller.verify(request, { code: 'c', state: 'library-state' }),
        ),
      ).toBe(400);
      expect(connected).toEqual([]);
    });
  });
});
