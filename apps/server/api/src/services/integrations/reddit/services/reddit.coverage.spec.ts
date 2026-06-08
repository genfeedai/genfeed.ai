/**
 * Additive coverage spec for RedditService.
 * Covers methods and branches NOT exercised by reddit.service.spec.ts.
 *
 * Existing spec covers:
 *   - service instantiation
 *   - generateAuthUrl (url shape + state param)
 *   - refreshToken (success with new refresh_token returned)
 *
 * This file covers:
 *   - generateAuthUrl (all URL params present)
 *   - refreshToken (no credential found, no new refresh_token → falls back to existing,
 *                   httpService.post failure)
 *   - getAccountDetails (success path, requireAccessToken missing-token branch)
 *   - postComment (success with bare thingId, success with t3_-prefixed thingId,
 *                  commentId from alternate path, httpService failure)
 *   - submitPost (self/text post, link post with url, no text/no url → link kind,
 *                 httpService failure)
 */

// ── Module-level mocks (must precede all imports) ────────────────────────────

vi.mock('@api/shared/utils/encryption/encryption.util', () => ({
  EncryptionUtil: {
    decrypt: vi.fn((value: string) => `decrypted_${value}`),
  },
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import type { CredentialDocument } from '@api/collections/credentials/schemas/credential.schema';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { ConfigService } from '@api/config/config.service';
import { RedditService } from '@api/services/integrations/reddit/services/reddit.service';
import { CredentialPlatform } from '@genfeedai/enums';
import { HttpService } from '@nestjs/axios';
import { Test, type TestingModule } from '@nestjs/testing';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Helpers ───────────────────────────────────────────────────────────────────

const makeCredential = (overrides: Record<string, unknown> = {}) =>
  ({
    _id: 'cred-id-1',
    accessToken: 'enc-access-token',
    isConnected: true,
    isDeleted: false,
    platform: CredentialPlatform.REDDIT,
    refreshToken: 'enc-refresh-token',
    ...overrides,
  }) as unknown as CredentialDocument;

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('RedditService (coverage)', () => {
  let service: RedditService;
  let credentialsService: {
    findOne: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
  };
  let httpService: {
    get: ReturnType<typeof vi.fn>;
    post: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    credentialsService = {
      findOne: vi.fn().mockResolvedValue(null),
      patch: vi.fn().mockResolvedValue(makeCredential()),
    };

    httpService = {
      get: vi.fn(),
      post: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedditService,
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn((key: string) => {
              const config: Record<string, string> = {
                REDDIT_CLIENT_ID: 'test-client-id',
                REDDIT_CLIENT_SECRET: 'test-client-secret',
                REDDIT_REDIRECT_URI: 'https://app.example.com/reddit/callback',
                REDDIT_USER_AGENT: 'test-agent/1.0',
              };
              return config[key];
            }),
          },
        },
        { provide: CredentialsService, useValue: credentialsService },
        { provide: HttpService, useValue: httpService },
      ],
    }).compile();

    service = module.get<RedditService>(RedditService);
  });

  // ── generateAuthUrl ────────────────────────────────────────────────────────

  describe('generateAuthUrl', () => {
    it('includes all required OAuth params in the URL', () => {
      const url = service.generateAuthUrl('csrf-abc');

      expect(url).toContain('client_id=test-client-id');
      expect(url).toContain('duration=permanent');
      expect(url).toContain('response_type=code');
      expect(url).toContain('scope=identity+submit');
      expect(url).toContain(
        'redirect_uri=https%3A%2F%2Fapp.example.com%2Freddit%2Fcallback',
      );
      expect(url).toContain('state=csrf-abc');
    });

    it('starts with the Reddit authorize base URL', () => {
      const url = service.generateAuthUrl('some-state');

      expect(url.startsWith('https://www.reddit.com/api/v1/authorize?')).toBe(
        true,
      );
    });
  });

  // ── refreshToken ──────────────────────────────────────────────────────────

  describe('refreshToken', () => {
    it('throws when credential is not found', async () => {
      credentialsService.findOne.mockResolvedValue(null);

      await expect(service.refreshToken('org-1', 'brand-1')).rejects.toThrow(
        'Reddit credential not found',
      );
    });

    it('throws when credential exists but has no refreshToken', async () => {
      credentialsService.findOne.mockResolvedValue(
        makeCredential({ refreshToken: null }),
      );

      await expect(service.refreshToken('org-1', 'brand-1')).rejects.toThrow(
        'Reddit credential not found',
      );
    });

    it('falls back to existing refreshToken when API returns no new refresh_token', async () => {
      const cred = makeCredential({ refreshToken: 'enc-old-rt' });
      credentialsService.findOne.mockResolvedValue(cred);
      httpService.post.mockReturnValue(
        of({
          data: { access_token: 'new-access', expires_in: 3600 },
        }),
      );
      const patched = makeCredential({ accessToken: 'new-access' });
      credentialsService.patch.mockResolvedValue(patched);

      const result = await service.refreshToken('org-1', 'brand-1');

      expect(credentialsService.patch).toHaveBeenCalledWith(
        'cred-id-1',
        expect.objectContaining({
          accessToken: 'new-access',
          isConnected: true,
          // no new refresh_token → falls back to the encrypted original
          refreshToken: 'enc-old-rt',
        }),
      );
      expect(result).toEqual(patched);
    });

    it('uses new refresh_token when API returns one', async () => {
      const cred = makeCredential({ refreshToken: 'enc-old-rt' });
      credentialsService.findOne.mockResolvedValue(cred);
      httpService.post.mockReturnValue(
        of({
          data: {
            access_token: 'fresh-access',
            expires_in: 7200,
            refresh_token: 'fresh-rt',
          },
        }),
      );

      await service.refreshToken('org-1', 'brand-1');

      expect(credentialsService.patch).toHaveBeenCalledWith(
        'cred-id-1',
        expect.objectContaining({ refreshToken: 'fresh-rt' }),
      );
    });

    it('propagates httpService error', async () => {
      const cred = makeCredential({ refreshToken: 'enc-rt' });
      credentialsService.findOne.mockResolvedValue(cred);
      httpService.post.mockReturnValue(
        throwError(() => new Error('Network error')),
      );

      await expect(service.refreshToken('org-1', 'brand-1')).rejects.toThrow(
        'Network error',
      );
    });

    it('sets accessTokenExpiry to undefined when expires_in is absent', async () => {
      const cred = makeCredential({ refreshToken: 'enc-rt' });
      credentialsService.findOne.mockResolvedValue(cred);
      httpService.post.mockReturnValue(
        of({ data: { access_token: 'tok', refresh_token: 'new-rt' } }),
      );

      await service.refreshToken('org-1', 'brand-1');

      expect(credentialsService.patch).toHaveBeenCalledWith(
        'cred-id-1',
        expect.objectContaining({ accessTokenExpiry: undefined }),
      );
    });
  });

  // ── getAccountDetails ─────────────────────────────────────────────────────

  describe('getAccountDetails', () => {
    it('returns account data on success', async () => {
      const cred = makeCredential({ accessToken: 'enc-at' });
      credentialsService.findOne.mockResolvedValue(
        makeCredential({ refreshToken: 'enc-rt' }),
      );
      // patch returns the updated credential with accessToken
      credentialsService.patch.mockResolvedValue(cred);

      const accountData = { icon_img: 'img.png', name: 'test_user' };
      httpService.post.mockReturnValue(
        of({
          data: {
            access_token: 'new-at',
            expires_in: 3600,
            refresh_token: 'new-rt',
          },
        }),
      );
      httpService.get.mockReturnValue(of({ data: accountData }));

      const result = await service.getAccountDetails('org-1', 'brand-1');

      expect(result).toEqual(accountData);
      expect(httpService.get).toHaveBeenCalledWith(
        'https://oauth.reddit.com/api/v1/me',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: expect.stringContaining('Bearer'),
          }),
        }),
      );
    });

    it('throws when credential has no accessToken after refresh', async () => {
      credentialsService.findOne.mockResolvedValue(
        makeCredential({ refreshToken: 'enc-rt' }),
      );
      // patch returns credential without accessToken
      credentialsService.patch.mockResolvedValue(
        makeCredential({ accessToken: null }),
      );
      httpService.post.mockReturnValue(
        of({
          data: { access_token: null, expires_in: 3600 },
        }),
      );

      await expect(
        service.getAccountDetails('org-1', 'brand-1'),
      ).rejects.toThrow('Reddit credential missing access token');
    });

    it('propagates httpService.get error', async () => {
      const cred = makeCredential({ accessToken: 'enc-at' });
      credentialsService.findOne.mockResolvedValue(
        makeCredential({ refreshToken: 'enc-rt' }),
      );
      credentialsService.patch.mockResolvedValue(cred);
      httpService.post.mockReturnValue(
        of({ data: { access_token: 'tok', refresh_token: 'new-rt' } }),
      );
      httpService.get.mockReturnValue(
        throwError(() => new Error('Reddit API down')),
      );

      await expect(
        service.getAccountDetails('org-1', 'brand-1'),
      ).rejects.toThrow('Reddit API down');
    });
  });

  // ── postComment ────────────────────────────────────────────────────────────

  describe('postComment', () => {
    const setupSuccessfulRefresh = (accessToken = 'enc-at'): void => {
      credentialsService.findOne.mockResolvedValue(
        makeCredential({ refreshToken: 'enc-rt' }),
      );
      credentialsService.patch.mockResolvedValue(
        makeCredential({ accessToken }),
      );
      httpService.post
        // first post = refreshToken HTTP call
        .mockReturnValueOnce(
          of({ data: { access_token: 'tok', refresh_token: 'new-rt' } }),
        );
    };

    it('prefixes bare thingId with t3_ before posting', async () => {
      setupSuccessfulRefresh();
      httpService.post.mockReturnValueOnce(
        of({
          data: {
            json: { data: { things: [{ data: { id: 'cmt-1' } }] } },
          },
        }),
      );

      const result = await service.postComment(
        'org-1',
        'brand-1',
        'abc123',
        'Great post!',
      );

      expect(result).toEqual({ commentId: 'cmt-1' });
      // The second post call is the comment API call
      const secondCall = httpService.post.mock.calls[1];
      const body = secondCall[1] as string;
      expect(body).toContain('thing_id=t3_abc123');
    });

    it('does not double-prefix thingId already starting with t3_', async () => {
      setupSuccessfulRefresh();
      httpService.post.mockReturnValueOnce(
        of({
          data: {
            json: { data: { things: [{ data: { id: 'cmt-2' } }] } },
          },
        }),
      );

      await service.postComment('org-1', 'brand-1', 't3_abc123', 'Nice!');

      const secondCall = httpService.post.mock.calls[1];
      const body = secondCall[1] as string;
      // should NOT produce t3_t3_abc123
      expect(body).toContain('thing_id=t3_abc123');
      expect(body).not.toContain('t3_t3_');
    });

    it('falls back to alternate commentId path (json.data.id)', async () => {
      setupSuccessfulRefresh();
      // Response has no things array; comment id is at json.data.id
      httpService.post.mockReturnValueOnce(
        of({
          data: {
            json: { data: { id: 'alt-cmt-id' } },
          },
        }),
      );

      const result = await service.postComment(
        'org-1',
        'brand-1',
        't3_post1',
        'Comment text',
      );

      expect(result).toEqual({ commentId: 'alt-cmt-id' });
    });

    it('returns commentId as undefined when neither path present', async () => {
      setupSuccessfulRefresh();
      httpService.post.mockReturnValueOnce(
        of({ data: { json: { data: {} } } }),
      );

      const result = await service.postComment(
        'org-1',
        'brand-1',
        't3_post1',
        'No id',
      );

      expect(result).toEqual({ commentId: undefined });
    });

    it('propagates httpService error on comment post', async () => {
      setupSuccessfulRefresh();
      httpService.post.mockReturnValueOnce(
        throwError(() => new Error('Comment API error')),
      );

      await expect(
        service.postComment('org-1', 'brand-1', 't3_abc', 'Text'),
      ).rejects.toThrow('Comment API error');
    });
  });

  // ── submitPost ─────────────────────────────────────────────────────────────

  describe('submitPost', () => {
    const setupSuccessfulRefresh = (accessToken = 'enc-at'): void => {
      credentialsService.findOne.mockResolvedValue(
        makeCredential({ refreshToken: 'enc-rt' }),
      );
      credentialsService.patch.mockResolvedValue(
        makeCredential({ accessToken }),
      );
      httpService.post
        // first call = refreshToken HTTP
        .mockReturnValueOnce(
          of({ data: { access_token: 'tok', refresh_token: 'new-rt' } }),
        );
    };

    it('submits a self (text) post and returns the post ID', async () => {
      setupSuccessfulRefresh();
      httpService.post.mockReturnValueOnce(
        of({ data: { json: { data: { id: 'self-post-id' } } } }),
      );

      const result = await service.submitPost(
        'org-1',
        'brand-1',
        'r/test',
        'My Title',
        'Post body text',
      );

      expect(result).toBe('self-post-id');
      const submitCall = httpService.post.mock.calls[1];
      const body = submitCall[1] as string;
      expect(body).toContain('kind=self');
      expect(body).toContain('text=Post+body+text');
      expect(body).not.toContain('url=');
    });

    it('submits a link post when url is provided without text', async () => {
      setupSuccessfulRefresh();
      httpService.post.mockReturnValueOnce(
        of({ data: { json: { data: { id: 'link-post-id' } } } }),
      );

      const result = await service.submitPost(
        'org-1',
        'brand-1',
        'r/test',
        'Link Title',
        undefined,
        'https://example.com',
      );

      expect(result).toBe('link-post-id');
      const submitCall = httpService.post.mock.calls[1];
      const body = submitCall[1] as string;
      expect(body).toContain('kind=link');
      expect(body).toContain(
        encodeURIComponent('https://example.com').replace(/%20/g, '+'),
      );
      expect(body).not.toContain('text=');
    });

    it('uses link kind when neither text nor url is provided', async () => {
      setupSuccessfulRefresh();
      httpService.post.mockReturnValueOnce(
        of({ data: { json: { data: { id: 'bare-post-id' } } } }),
      );

      await service.submitPost('org-1', 'brand-1', 'r/test', 'Bare');

      const submitCall = httpService.post.mock.calls[1];
      const body = submitCall[1] as string;
      expect(body).toContain('kind=link');
    });

    it('includes both text and url params when both are provided', async () => {
      setupSuccessfulRefresh();
      httpService.post.mockReturnValueOnce(
        of({ data: { json: { data: { id: 'both-post-id' } } } }),
      );

      await service.submitPost(
        'org-1',
        'brand-1',
        'r/test',
        'Both Title',
        'Some text',
        'https://example.com',
      );

      const submitCall = httpService.post.mock.calls[1];
      const body = submitCall[1] as string;
      // text provided → kind=self
      expect(body).toContain('kind=self');
      expect(body).toContain('text=Some+text');
      expect(body).toContain('url=');
    });

    it('propagates httpService error on submit', async () => {
      setupSuccessfulRefresh();
      httpService.post.mockReturnValueOnce(
        throwError(() => new Error('Submit failed')),
      );

      await expect(
        service.submitPost('org-1', 'brand-1', 'r/test', 'Title'),
      ).rejects.toThrow('Submit failed');
    });

    it('returns undefined when API response has no id', async () => {
      setupSuccessfulRefresh();
      httpService.post.mockReturnValueOnce(
        of({ data: { json: { data: {} } } }),
      );

      const result = await service.submitPost(
        'org-1',
        'brand-1',
        'r/test',
        'No ID Post',
      );

      expect(result).toBeUndefined();
    });
  });
});
