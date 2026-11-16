vi.mock('@api/shared/utils/webhook-validator/webhook-validator.util', () => ({
  createSafeWebhookHttpsAgent: vi.fn(async () => ({ destroy: vi.fn() })),
}));

vi.mock('@libs/utils/encryption/encryption.util', () => ({
  EncryptionUtil: { decrypt: (value: string) => `plain:${value}` },
}));

import type { CredentialDocument } from '@api/collections/credentials/credential.types';
import { BlueskyService } from '@api/services/integrations/bluesky/services/bluesky.service';
import { BlueskyCredentialRejectedError } from '@api/services/integrations/bluesky/utils/bluesky-api-error.util';
import { ActivityKey } from '@genfeedai/contracts';
import { type Observable, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface FakeRequest {
  data?: Record<string, unknown>;
  headers: Record<string, string>;
  url: string;
}

type FakeResponder = (
  request: FakeRequest,
  callNumber: number,
) => Observable<{ data: unknown }>;

/** The shape axios throws for a non-2xx answer (axios is mocked in unit tests). */
function httpError(status: number, error: string): Error {
  return Object.assign(new Error('request failed'), {
    isAxiosError: true,
    response: { data: { error, message: error }, status },
  });
}

// Built at runtime so no credential-shaped literal sits in the source.
const APP_CREDENTIAL = ['aaaa', 'bbbb', 'cccc', 'dddd'].join('-');
const REFUSED_CREDENTIAL = ['refused', 'value'].join('-');

const session = (suffix = '1') => ({
  accessJwt: `jwt-${suffix}`,
  did: 'did:plc:abc123',
  handle: 'alice.bsky.social',
});

function makeCredential(
  overrides: Partial<CredentialDocument> = {},
): CredentialDocument {
  return {
    accessToken: 'encrypted-password',
    brandId: 'brand-1',
    description: 'https://bsky.social',
    externalHandle: 'alice.bsky.social',
    externalId: 'did:plc:abc123',
    id: 'credential-1',
    isConnected: true,
    organizationId: 'org-1',
    userId: 'user-1',
    ...overrides,
  } as unknown as CredentialDocument;
}

describe('BlueskyService', () => {
  let requests: FakeRequest[];
  let respond: FakeResponder;
  let patches: Array<{ id: string; update: Record<string, unknown> }>;
  let activities: Array<Record<string, unknown>>;
  let service: BlueskyService;

  beforeEach(() => {
    requests = [];
    patches = [];
    activities = [];
    respond = () => of({ data: session() });

    service = new BlueskyService(
      { cdnUrl: 'https://cdn.genfeed.ai' } as never,
      {
        patch: async (id: string, update: Record<string, unknown>) => {
          patches.push({ id, update });
        },
      } as never,
      {
        record: async (activity: Record<string, unknown>) => {
          activities.push(activity);
        },
      } as never,
      { error: vi.fn(), log: vi.fn(), warn: vi.fn() } as never,
      {
        request: (config: FakeRequest) => {
          requests.push(config);
          return respond(config, requests.length);
        },
      } as never,
    );
  });

  describe('createSession', () => {
    it('signs in with the handle and app password and returns the identity', async () => {
      const result = await service.createSession(
        'https://bsky.social',
        'alice.bsky.social',
        APP_CREDENTIAL,
      );

      expect(result).toEqual({
        accessJwt: 'jwt-1',
        did: 'did:plc:abc123',
        handle: 'alice.bsky.social',
        serviceUrl: 'https://bsky.social',
      });
      expect(requests[0]).toMatchObject({
        data: {
          identifier: 'alice.bsky.social',
          password: APP_CREDENTIAL,
        },
        url: 'https://bsky.social/xrpc/com.atproto.server.createSession',
      });
    });

    it('refuses a server address that is not an https origin', async () => {
      await expect(
        service.createSession('http://bsky.social', 'a.b', REFUSED_CREDENTIAL),
      ).rejects.toThrow('Invalid Bluesky server address');
      expect(requests).toEqual([]);
    });
  });

  describe('openSession', () => {
    it('signs in with the stored password and the account DID', async () => {
      await service.openSession(makeCredential());

      expect(requests[0].data).toEqual({
        identifier: 'did:plc:abc123',
        password: 'plain:encrypted-password',
      });
    });

    it('reuses the session instead of signing in for every post', async () => {
      const credential = makeCredential();

      const first = await service.openSession(credential);
      const second = await service.openSession(credential);

      expect(second).toBe(first);
      expect(requests).toHaveLength(1);
    });

    it('signs in again when the owner reconnects with a new password', async () => {
      await service.openSession(makeCredential());
      await service.openSession(
        makeCredential({ accessToken: 'encrypted-new' as never }),
      );

      expect(requests).toHaveLength(2);
    });

    it('marks the channel disconnected and alerts the owner when the password is refused', async () => {
      respond = () =>
        throwError(() => httpError(401, 'AuthenticationRequired'));

      await expect(
        service.openSession(makeCredential()),
      ).rejects.toBeInstanceOf(BlueskyCredentialRejectedError);

      expect(patches).toEqual([
        { id: 'credential-1', update: { isConnected: false } },
      ]);
      expect(activities).toHaveLength(1);
      expect(activities[0]).toMatchObject({
        brandId: 'brand-1',
        key: ActivityKey.SOCIAL_INTEGRATION_DISCONNECTED,
        organizationId: 'org-1',
        userId: 'user-1',
      });
      expect(activities[0].alert).toMatchObject({
        payload: { event: 'channel_disconnected', label: 'alice.bsky.social' },
      });
    });

    it('does not alert again for a channel that is already disconnected', async () => {
      respond = () =>
        throwError(() => httpError(401, 'AuthenticationRequired'));

      await expect(
        service.openSession(makeCredential({ isConnected: false })),
      ).rejects.toBeInstanceOf(BlueskyCredentialRejectedError);

      expect(patches).toEqual([]);
      expect(activities).toEqual([]);
    });

    it('keeps the channel connected when Bluesky is merely unavailable', async () => {
      respond = () => throwError(() => httpError(502, 'UpstreamFailure'));

      await expect(service.openSession(makeCredential())).rejects.toThrow(
        'request failed',
      );

      expect(patches).toEqual([]);
      expect(activities).toEqual([]);
    });

    it('does not sign in with a credential that has no stored password', async () => {
      await expect(
        service.openSession(makeCredential({ accessToken: null as never })),
      ).rejects.toThrow('Bluesky credential is incomplete');
      expect(requests).toEqual([]);
    });

    it('rejects a login that resolves to a different account', async () => {
      respond = () =>
        of({ data: { ...session(), did: 'did:plc:someoneelse' } });

      await expect(service.openSession(makeCredential())).rejects.toThrow(
        'Bluesky account changed',
      );
    });
  });

  describe('createPost', () => {
    const record = {
      $type: 'app.bsky.feed.post' as const,
      createdAt: '2026-11-16T09:00:00.000Z',
      text: 'Hello',
    };

    it('creates the post record in the signed-in account repo', async () => {
      respond = (request) =>
        request.url.endsWith('createSession')
          ? of({ data: session() })
          : of({
              data: {
                cid: 'bafycid',
                uri: 'at://did:plc:abc123/app.bsky.feed.post/3k1',
              },
            });

      const ref = await service.createPost(makeCredential(), record);

      expect(ref).toEqual({
        cid: 'bafycid',
        uri: 'at://did:plc:abc123/app.bsky.feed.post/3k1',
      });
      expect(requests[1]).toMatchObject({
        data: {
          collection: 'app.bsky.feed.post',
          record,
          repo: 'did:plc:abc123',
        },
        headers: { Authorization: 'Bearer jwt-1' },
        url: 'https://bsky.social/xrpc/com.atproto.repo.createRecord',
      });
    });

    it('replaces an expired session token once and publishes', async () => {
      let sessionCount = 0;
      respond = (request) => {
        if (request.url.endsWith('createSession')) {
          sessionCount += 1;
          return of({ data: session(String(sessionCount)) });
        }
        return request.headers.Authorization === 'Bearer jwt-1'
          ? throwError(() => httpError(400, 'ExpiredToken'))
          : of({
              data: {
                cid: 'bafycid',
                uri: 'at://did:plc:abc123/app.bsky.feed.post/3k2',
              },
            });
      };

      const ref = await service.createPost(makeCredential(), record);

      expect(ref.uri).toBe('at://did:plc:abc123/app.bsky.feed.post/3k2');
      expect(sessionCount).toBe(2);
    });

    it('does not retry when Bluesky rejects the record itself', async () => {
      respond = (request) =>
        request.url.endsWith('createSession')
          ? of({ data: session() })
          : throwError(() => httpError(400, 'InvalidRequest'));

      await expect(
        service.createPost(makeCredential(), record),
      ).rejects.toThrow('request failed');

      expect(
        requests.filter((request) => request.url.endsWith('createRecord')),
      ).toHaveLength(1);
    });
  });

  describe('buildFacets', () => {
    it('resolves a mention to a DID and leaves an unknown handle as text', async () => {
      respond = (request) => {
        const handle = (request as unknown as { params: { handle: string } })
          .params.handle;
        return handle === 'bob.example.com'
          ? of({ data: { did: 'did:plc:bob' } })
          : throwError(() => httpError(400, 'InvalidRequest'));
      };

      const facets = await service.buildFacets(
        makeCredential(),
        '@bob.example.com and @nobody.example.com',
      );

      expect(facets).toEqual([
        {
          features: [
            { $type: 'app.bsky.richtext.facet#mention', did: 'did:plc:bob' },
          ],
          index: { byteEnd: 16, byteStart: 0 },
        },
      ]);
    });
  });
});
