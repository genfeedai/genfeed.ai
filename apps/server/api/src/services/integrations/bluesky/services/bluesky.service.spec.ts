vi.mock('@api/shared/utils/webhook-validator/webhook-validator.util', () => ({
  createSafeWebhookHttpsAgent: vi.fn(async () => ({ destroy: vi.fn() })),
}));

vi.mock('@libs/utils/encryption/encryption.util', () => ({
  EncryptionUtil: { decrypt: (value: string) => value.replace(/^enc:/, '') },
}));

import type { CredentialDocument } from '@api/collections/credentials/credential.types';
import { BlueskyService } from '@api/services/integrations/bluesky/services/bluesky.service';
import type { BlueskySessionBinding } from '@api/services/integrations/bluesky/services/bluesky-oauth.service';
import { BlueskyCredentialRejectedError } from '@api/services/integrations/bluesky/utils/bluesky-api-error.util';
import {
  type NodeSavedSession,
  TokenInvalidError,
  TokenRefreshError,
} from '@atproto/oauth-client-node';
import { ActivityKey } from '@genfeedai/contracts';
import { type Observable, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface FakeRequest {
  data?: Record<string, unknown>;
  headers: Record<string, string>;
  url: string;
}

type FakeResponder = (request: FakeRequest) => Observable<{ data: unknown }>;

/** The shape axios throws for a non-2xx answer (axios is mocked in unit tests). */
function httpError(status: number, error: string): Error {
  return Object.assign(new Error('request failed'), {
    isAxiosError: true,
    response: { data: { error, message: error }, status },
  });
}

interface SignedCall {
  body: Record<string, unknown> | null;
  contentType: string | undefined;
  path: string;
}

type SignedResponder = (call: SignedCall) => { body: unknown; status: number };

const SAVED_SESSION = {
  authMethod: { method: 'private_key_jwt' },
  dpopJwk: { kty: 'EC' },
  tokenSet: { sub: 'did:plc:abc123' },
} as unknown as NodeSavedSession;

function makeCredential(
  overrides: Partial<CredentialDocument> = {},
): CredentialDocument {
  return {
    accessToken: `enc:${JSON.stringify(SAVED_SESSION)}`,
    brandId: 'brand-1',
    description: 'https://pds.example.com',
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
  let signedCalls: SignedCall[];
  let answerSigned: SignedResponder;
  let restoreError: Error | null;
  let bindings: BlueskySessionBinding[];
  let stored: CredentialDocument | null;
  let patches: Array<{ id: string; update: Record<string, unknown> }>;
  let activities: Array<Record<string, unknown>>;
  let service: BlueskyService;

  beforeEach(() => {
    requests = [];
    signedCalls = [];
    bindings = [];
    patches = [];
    activities = [];
    restoreError = null;
    stored = makeCredential();
    respond = () => of({ data: {} });
    answerSigned = () => ({ body: {}, status: 200 });

    service = new BlueskyService(
      { cdnUrl: 'https://cdn.genfeed.ai' } as never,
      {
        restoreSession: async (did: string, binding: BlueskySessionBinding) => {
          bindings.push(binding);
          if (restoreError) {
            throw restoreError;
          }
          return {
            did,
            fetchHandler: async (path: string, init: RequestInit) => {
              const call: SignedCall = {
                body:
                  typeof init.body === 'string'
                    ? (JSON.parse(init.body) as Record<string, unknown>)
                    : null,
                contentType: (init.headers as Record<string, string>)[
                  'Content-Type'
                ],
                path,
              };
              signedCalls.push(call);
              const answer = answerSigned(call);
              return new Response(JSON.stringify(answer.body), {
                headers: { 'content-type': 'application/json' },
                status: answer.status,
              });
            },
          };
        },
      } as never,
      {
        findOne: async () => stored,
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
          return respond(config);
        },
      } as never,
    );
  });

  describe('createPost', () => {
    const record = {
      $type: 'app.bsky.feed.post' as const,
      createdAt: '2026-11-16T09:00:00.000Z',
      text: 'Hello',
    };

    it('creates the post record in the signed-in account repo', async () => {
      answerSigned = () => ({
        body: {
          cid: 'bafycid',
          uri: 'at://did:plc:abc123/app.bsky.feed.post/3k1',
        },
        status: 200,
      });

      const ref = await service.createPost(makeCredential(), record);

      expect(ref).toEqual({
        cid: 'bafycid',
        uri: 'at://did:plc:abc123/app.bsky.feed.post/3k1',
      });
      expect(signedCalls).toEqual([
        {
          body: {
            collection: 'app.bsky.feed.post',
            record,
            repo: 'did:plc:abc123',
          },
          contentType: 'application/json',
          path: '/xrpc/com.atproto.repo.createRecord',
        },
      ]);
    });

    it('does not retry when Bluesky rejects the record itself', async () => {
      answerSigned = () => ({
        body: { error: 'InvalidRequest', message: 'bad record' },
        status: 400,
      });

      await expect(
        service.createPost(makeCredential(), record),
      ).rejects.toThrow('bad record');

      expect(signedCalls).toHaveLength(1);
      expect(patches).toEqual([]);
    });

    it('marks the channel disconnected when Bluesky refuses the session', async () => {
      answerSigned = () => ({
        body: { error: 'AuthenticationRequired', message: 'no' },
        status: 401,
      });

      await expect(
        service.createPost(makeCredential(), record),
      ).rejects.toBeInstanceOf(BlueskyCredentialRejectedError);

      expect(patches).toEqual([
        { id: 'credential-1', update: { isConnected: false } },
      ]);
    });
  });

  describe('uploadBlob', () => {
    it('sends the bytes with their media type and returns the blob reference', async () => {
      const blob = {
        $type: 'blob' as const,
        mimeType: 'image/jpeg',
        ref: { $link: 'bafyblob' },
        size: 3,
      };
      answerSigned = () => ({ body: { blob }, status: 200 });

      const result = await service.uploadBlob(
        makeCredential(),
        Buffer.from([1, 2, 3]),
        'image/jpeg',
      );

      expect(result).toEqual(blob);
      expect(signedCalls[0]).toMatchObject({
        contentType: 'image/jpeg',
        path: '/xrpc/com.atproto.repo.uploadBlob',
      });
    });
  });

  describe('a session that can no longer be opened', () => {
    const record = {
      $type: 'app.bsky.feed.post' as const,
      createdAt: '2026-11-16T09:00:00.000Z',
      text: 'Hello',
    };

    it.each([
      [
        'the refresh token is refused',
        new TokenRefreshError('did:plc:abc123', 'revoked'),
      ],
      [
        'Bluesky says the token is invalid',
        new TokenInvalidError('did:plc:abc123'),
      ],
    ])(
      'marks the channel disconnected and alerts the owner when %s',
      async (_name, error) => {
        restoreError = error;

        await expect(
          service.createPost(makeCredential(), record),
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
          payload: {
            event: 'channel_disconnected',
            label: 'alice.bsky.social',
          },
        });
      },
    );

    it('does not alert again for a channel that is already disconnected', async () => {
      restoreError = new TokenRefreshError('did:plc:abc123', 'revoked');

      await expect(
        service.createPost(makeCredential({ isConnected: false }), record),
      ).rejects.toBeInstanceOf(BlueskyCredentialRejectedError);

      expect(patches).toEqual([]);
      expect(activities).toEqual([]);
    });

    it('keeps the channel connected when Bluesky is merely unavailable', async () => {
      restoreError = new TypeError('fetch failed');

      await expect(
        service.createPost(makeCredential(), record),
      ).rejects.toThrow('fetch failed');

      expect(patches).toEqual([]);
      expect(activities).toEqual([]);
    });

    it('treats a credential with no saved session as disconnected', async () => {
      await expect(
        service.createPost(
          makeCredential({ accessToken: null as never }),
          record,
        ),
      ).rejects.toBeInstanceOf(BlueskyCredentialRejectedError);

      expect(signedCalls).toEqual([]);
      expect(patches).toEqual([
        { id: 'credential-1', update: { isConnected: false } },
      ]);
    });

    it('refuses a credential saved without its account server', async () => {
      await expect(
        service.createPost(
          makeCredential({ description: null as never }),
          record,
        ),
      ).rejects.toThrow('Bluesky credential is incomplete');
    });
  });

  describe('where the session is saved', () => {
    async function openBinding(): Promise<BlueskySessionBinding> {
      await service
        .createPost(makeCredential(), {
          $type: 'app.bsky.feed.post',
          createdAt: '2026-11-16T09:00:00.000Z',
          text: 'Hello',
        })
        .catch(() => undefined);
      return bindings[0];
    }

    it('reads the session stored on the credential, not a copy from when the publish began', async () => {
      const binding = await openBinding();
      const rotated = {
        ...SAVED_SESSION,
        tokenSet: { sub: 'did:plc:abc123', refresh_token: 'rotated' },
      };
      stored = makeCredential({
        accessToken: `enc:${JSON.stringify(rotated)}`,
      });

      expect(await binding.read()).toEqual(rotated);
    });

    it('saves a refreshed session on the credential', async () => {
      const binding = await openBinding();

      await binding.write(SAVED_SESSION);

      expect(patches).toEqual([
        {
          id: 'credential-1',
          update: { accessToken: JSON.stringify(SAVED_SESSION) },
        },
      ]);
    });

    it('drops the saved session when Bluesky ends it', async () => {
      const binding = await openBinding();

      await binding.remove();

      expect(patches).toEqual([
        { id: 'credential-1', update: { accessToken: null } },
      ]);
    });

    it('reads nothing when the credential no longer holds a session', async () => {
      const binding = await openBinding();
      stored = makeCredential({ accessToken: null as never });

      expect(await binding.read()).toBeUndefined();
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
