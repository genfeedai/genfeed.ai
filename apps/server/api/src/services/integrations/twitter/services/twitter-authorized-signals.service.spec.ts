vi.mock('@libs/utils/encryption/encryption.util', () => ({
  EncryptionUtil: {
    decrypt: vi.fn((value: string) => value),
  },
}));

import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { SocialWarmupEnrollmentsService } from '@api/collections/social-warmup-enrollments/services/social-warmup-enrollments.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { CacheService } from '@api/services/cache/cache.service';
import { TwitterService } from '@api/services/integrations/twitter/services/twitter.service';
import { TwitterAuthorizedSignalsService } from '@api/services/integrations/twitter/services/twitter-authorized-signals.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { CredentialPlatform, TargetExecutionState } from '@genfeedai/contracts';
import {
  type TwitterAuthorizedSignalEvidence,
  type TwitterAuthorizedSignalsSnapshot,
  twitterAuthorizedSignalsSnapshotSchema,
} from '@genfeedai/contracts/api-types/contracts/twitter-authorized-signals.contract';
import { LoggerService } from '@libs/logger/logger.service';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';

const now = new Date('2026-08-14T08:00:00.000Z');
const USERS_READ_SCOPE = 'users.read';
const TWEET_READ_SCOPE = 'tweet.read';
const TWEET_WRITE_SCOPE = 'tweet.write';
const MEDIA_WRITE_SCOPE = 'media.write';
const fullScopes = [
  'tweet.read',
  'tweet.write',
  'users.read',
  'media.write',
  'offline.access',
];

function providerError(status: number, title?: string, retryAfter?: string) {
  return {
    response: {
      data: { status, title: title ?? 'error' },
      headers:
        retryAfter === undefined ? {} : { 'x-rate-limit-reset': retryAfter },
      status,
    },
  };
}

function evidenceOf(
  snapshot: TwitterAuthorizedSignalsSnapshot,
  key: TwitterAuthorizedSignalEvidence['key'],
) {
  const evidence = snapshot.evidence.find((item) => item.key === key);
  if (!evidence) {
    throw new Error(`Missing evidence ${key}`);
  }
  return evidence;
}

function makePreviousSnapshot(): TwitterAuthorizedSignalsSnapshot {
  const scope = {
    granted: [TWEET_READ_SCOPE],
    missing: [],
    required: [TWEET_READ_SCOPE],
  };
  const common = {
    fieldAvailability: { id: 'available' as const },
    observedAt: '2026-08-13T08:00:00.000Z',
    provenance: 'platform_verified' as const,
    scope,
    staleAt: null,
    status: 'available' as const,
  };
  const post = {
    createTime: 1_723_000_000,
    createdAt: '2024-08-07T00:00:00.000Z',
    id: 'tweet-1',
    likeCount: 4,
    text: 'First original',
  };

  return twitterAuthorizedSignalsSnapshotSchema.parse({
    credentialId: 'credential-1',
    evidence: [
      {
        ...common,
        key: 'profile-completeness-signal',
        scope: {
          granted: [USERS_READ_SCOPE],
          missing: [],
          required: [USERS_READ_SCOPE],
        },
        value: { name: 'Creator', username: 'creator' },
      },
      {
        ...common,
        key: 'profile-statistics-snapshot',
        scope: {
          granted: [USERS_READ_SCOPE],
          missing: [],
          required: [USERS_READ_SCOPE],
        },
        value: { followersCount: 10, tweetCount: 1 },
      },
      {
        ...common,
        key: 'owned-posts-snapshot',
        value: { hasMore: false, posts: [post] },
      },
      {
        ...common,
        key: 'publishing-capability-snapshot',
        scope: {
          granted: [TWEET_WRITE_SCOPE],
          missing: [],
          required: [TWEET_WRITE_SCOPE],
        },
        value: { canPublish: true, canUploadMedia: true },
      },
      {
        ...common,
        key: 'first-upload-platform-signal',
        value: { createTime: post.createTime, createdAt: post.createdAt, post },
      },
      {
        ...common,
        key: 'owned-post-metrics-snapshot',
        value: { posts: [post] },
      },
      {
        ...common,
        key: 'native-account-age',
        scope: {
          granted: [USERS_READ_SCOPE],
          missing: [],
          required: [USERS_READ_SCOPE],
        },
        value: {
          createdAt: '2018-01-01T00:00:00.000Z',
          createTime: 1_514_764_800,
        },
      },
      {
        fieldAvailability: { outcome: 'available' },
        key: 'genfeed-publish-activity',
        observedAt: '2026-08-13T08:00:00.000Z',
        provenance: 'genfeed_observed',
        scope: { granted: [], missing: [], required: [] },
        staleAt: null,
        status: 'empty',
        value: { attempts: [] },
      },
    ],
    grantedScopes: fullScopes,
    platform: CredentialPlatform.TWITTER,
    refreshAttemptedAt: '2026-08-13T08:00:00.000Z',
    state: 'full',
  });
}

describe('TwitterAuthorizedSignalsService', () => {
  let service: TwitterAuthorizedSignalsService;
  let cacheService: {
    get: ReturnType<typeof vi.fn>;
    set: ReturnType<typeof vi.fn>;
  };
  let credentialsService: {
    findOne: ReturnType<typeof vi.fn>;
    mergeWarmupSignals: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
  };
  let httpService: {
    get: ReturnType<typeof vi.fn>;
  };
  let prisma: {
    post: { findMany: ReturnType<typeof vi.fn> };
  };
  let twitterService: {
    getValidCredential: ReturnType<typeof vi.fn>;
    handleAuthorizationError: ReturnType<typeof vi.fn>;
    refreshToken: ReturnType<typeof vi.fn>;
  };
  let enrollmentsService: {
    syncTwitterAuthorizedSnapshot: ReturnType<typeof vi.fn>;
  };

  const credential = {
    accessToken: 'access-token',
    accessTokenExpiry: new Date('2026-08-15T08:00:00.000Z'),
    brandId: 'brand-1',
    externalId: 'user-1',
    grantedScopes: fullScopes,
    id: 'credential-1',
    isConnected: true,
    isDeleted: false,
    organizationId: 'org-1',
    platform: 'TWITTER',
    warmupSignals: {},
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);

    vi.mocked(EncryptionUtil.decrypt).mockClear();

    cacheService = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(true),
    };
    credentialsService = {
      findOne: vi.fn().mockResolvedValue(credential),
      mergeWarmupSignals: vi.fn().mockResolvedValue(undefined),
      patch: vi.fn().mockResolvedValue(credential),
    };
    httpService = {
      get: vi.fn().mockImplementation((url: string) => {
        if (url.includes('/users/me')) {
          return of({
            data: {
              data: {
                created_at: '2018-01-01T00:00:00.000Z',
                description: 'Niche creator',
                id: 'user-1',
                location: 'Earth',
                name: 'Creator',
                profile_image_url: 'https://x.example/avatar.jpg',
                protected: false,
                public_metrics: {
                  followers_count: 0,
                  following_count: 4,
                  like_count: 0,
                  listed_count: 0,
                  tweet_count: 1,
                },
                url: 'https://x.com/creator',
                username: 'creator',
                verified: false,
                verified_type: 'none',
              },
            },
          });
        }

        return of({
          data: {
            data: [
              {
                conversation_id: 'tweet-1',
                created_at: '2024-08-07T00:00:00.000Z',
                id: 'tweet-1',
                public_metrics: {
                  bookmark_count: 0,
                  impression_count: 12,
                  like_count: 0,
                  quote_count: 0,
                  reply_count: 0,
                  retweet_count: 0,
                },
                reply_settings: 'everyone',
                text: 'First original',
              },
            ],
            meta: { result_count: 1 },
          },
        });
      }),
    };
    prisma = {
      post: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'post-1',
            lastAttemptAt: now,
            publicationDate: null,
            publishedAt: null,
            targetExecutionState: TargetExecutionState.FAILED,
            updatedAt: now,
          },
        ]),
      },
    };
    twitterService = {
      getValidCredential: vi.fn().mockResolvedValue(credential),
      handleAuthorizationError: vi.fn().mockResolvedValue(false),
      refreshToken: vi.fn().mockResolvedValue(credential),
    };
    enrollmentsService = {
      syncTwitterAuthorizedSnapshot: vi.fn().mockResolvedValue(undefined),
    };

    service = new TwitterAuthorizedSignalsService(
      cacheService as unknown as CacheService,
      credentialsService as unknown as CredentialsService,
      httpService as unknown as HttpService,
      { log: vi.fn() } as unknown as LoggerService,
      prisma as unknown as PrismaService,
      twitterService as unknown as TwitterService,
      enrollmentsService as unknown as SocialWarmupEnrollmentsService,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('maps full authorized profile, counts, owned posts, publishing capability, and Genfeed outcomes', async () => {
    const snapshot = await service.refresh({
      credentialId: credential.id,
      force: true,
      grantedScopes: fullScopes,
      organizationId: 'org-1',
    });

    expect(snapshot.state).toBe('full');
    expect(snapshot.platform).toBe(CredentialPlatform.TWITTER);
    expect(snapshot.grantedScopes).toEqual([...fullScopes].sort());
    expect(evidenceOf(snapshot, 'profile-completeness-signal')).toMatchObject({
      provenance: 'platform_verified',
      status: 'available',
      value: { name: 'Creator', username: 'creator', isVerified: false },
    });
    expect(evidenceOf(snapshot, 'profile-statistics-snapshot')).toMatchObject({
      provenance: 'platform_verified',
      status: 'available',
      value: { followersCount: 0, likeCount: 0, tweetCount: 1 },
    });
    expect(evidenceOf(snapshot, 'owned-posts-snapshot')).toMatchObject({
      scope: {
        granted: [TWEET_READ_SCOPE],
        missing: [],
        required: [TWEET_READ_SCOPE],
      },
      value: { posts: [{ id: 'tweet-1', impressionCount: 12 }] },
    });
    expect(
      evidenceOf(snapshot, 'publishing-capability-snapshot'),
    ).toMatchObject({
      value: {
        canPublish: true,
        canUploadMedia: true,
        isProtected: false,
      },
    });
    expect(evidenceOf(snapshot, 'native-account-age')).toMatchObject({
      provenance: 'platform_verified',
      value: { createdAt: '2018-01-01T00:00:00.000Z' },
    });
    expect(evidenceOf(snapshot, 'genfeed-publish-activity')).toMatchObject({
      provenance: 'genfeed_observed',
      value: {
        attempts: [
          {
            attemptedAt: now.toISOString(),
            outcome: 'failed',
            postId: 'post-1',
          },
        ],
      },
    });
  });

  it('keeps missing scopes permission-limited without inventing zero values', async () => {
    const snapshot = await service.refresh({
      credentialId: credential.id,
      force: true,
      grantedScopes: [USERS_READ_SCOPE],
      organizationId: 'org-1',
    });

    expect(snapshot.state).toBe('partial');
    expect(evidenceOf(snapshot, 'profile-completeness-signal')).toMatchObject({
      status: 'available',
      value: { username: 'creator' },
    });
    expect(evidenceOf(snapshot, 'owned-posts-snapshot')).toMatchObject({
      reason: 'missing_scope',
      scope: {
        granted: [],
        missing: [TWEET_READ_SCOPE],
        required: [TWEET_READ_SCOPE],
      },
      status: 'permission_limited',
    });
    expect(evidenceOf(snapshot, 'owned-posts-snapshot')).not.toHaveProperty(
      'value',
    );
    expect(
      evidenceOf(snapshot, 'publishing-capability-snapshot'),
    ).toMatchObject({
      reason: 'missing_scope',
      status: 'permission_limited',
    });
    expect(httpService.get).toHaveBeenCalledTimes(1);
    expect(httpService.get).toHaveBeenCalledWith(
      expect.stringContaining('/users/me'),
      expect.anything(),
    );
  });

  it('does not call X data endpoints when no data scopes were granted', async () => {
    const snapshot = await service.refresh({
      credentialId: credential.id,
      force: true,
      grantedScopes: [],
      organizationId: 'org-1',
    });

    expect(snapshot.state).toBe('partial');
    expect(httpService.get).not.toHaveBeenCalled();
    for (const evidence of snapshot.evidence.filter(
      (item) => item.provenance === 'platform_verified',
    )) {
      expect(evidence.status).toBe('permission_limited');
      expect(evidence.reason).toBe('missing_scope');
    }
  });

  it('never fetches DMs, likes made, follows, or bookmarks', async () => {
    await service.refresh({
      credentialId: credential.id,
      force: true,
      grantedScopes: [...fullScopes, 'dm.read', 'dm.write', 'like.read'],
      organizationId: 'org-1',
    });

    for (const call of httpService.get.mock.calls) {
      expect(String(call[0])).not.toMatch(
        /dm|likes|following|followers|bookmarks/i,
      );
    }
  });

  it('discovers exact scopes once through token refresh for pre-existing connections', async () => {
    credentialsService.findOne.mockResolvedValueOnce({
      ...credential,
      grantedScopes: [],
      refreshToken: 'refresh-token',
    });
    twitterService.refreshToken.mockResolvedValueOnce({
      ...credential,
      grantedScopes: [USERS_READ_SCOPE],
      refreshToken: 'refresh-token',
      warmupSignals: {
        twitterAuthorization: { grantedScopes: [USERS_READ_SCOPE] },
      },
    });

    const snapshot = await service.refresh({
      credentialId: credential.id,
      force: true,
      organizationId: 'org-1',
    });

    expect(twitterService.refreshToken).toHaveBeenCalledWith(
      'org-1',
      'brand-1',
      credential.id,
    );
    expect(twitterService.getValidCredential).not.toHaveBeenCalled();
    expect(snapshot.grantedScopes).toEqual([USERS_READ_SCOPE]);
    expect(httpService.get).toHaveBeenCalledTimes(1);
  });

  it('represents an authorized empty account distinctly', async () => {
    httpService.get.mockImplementation((url: string) =>
      url.includes('/users/me')
        ? of({
            data: {
              data: {
                created_at: '2026-08-01T00:00:00.000Z',
                description: '',
                id: 'user-new',
                name: 'New creator',
                profile_image_url: 'https://x.example/new.jpg',
                protected: false,
                public_metrics: {
                  followers_count: 0,
                  following_count: 0,
                  like_count: 0,
                  listed_count: 0,
                  tweet_count: 0,
                },
                username: 'new-creator',
                verified: false,
              },
            },
          })
        : of({ data: { data: [], meta: { result_count: 0 } } }),
    );
    prisma.post.findMany.mockResolvedValueOnce([]);

    const snapshot = await service.refresh({
      credentialId: credential.id,
      force: true,
      grantedScopes: fullScopes,
      organizationId: 'org-1',
    });

    expect(snapshot.state).toBe('empty');
    expect(evidenceOf(snapshot, 'owned-posts-snapshot')).toMatchObject({
      status: 'empty',
      value: { posts: [] },
    });
    expect(evidenceOf(snapshot, 'genfeed-publish-activity').status).toBe(
      'empty',
    );
  });

  it('preserves the last successful values as revoked and stale-dated on token revocation', async () => {
    const previous = makePreviousSnapshot();
    credentialsService.findOne.mockResolvedValueOnce({
      ...credential,
      warmupSignals: { twitterAuthorized: previous },
    });
    httpService.get.mockReturnValueOnce(throwError(() => providerError(401)));
    twitterService.handleAuthorizationError.mockResolvedValueOnce(true);

    const snapshot = await service.refresh({
      credentialId: credential.id,
      force: true,
      grantedScopes: fullScopes,
      organizationId: 'org-1',
    });

    expect(snapshot.state).toBe('revoked');
    expect(evidenceOf(snapshot, 'profile-completeness-signal')).toMatchObject({
      observedAt: '2026-08-13T08:00:00.000Z',
      reason: 'authorization_revoked',
      staleAt: now.toISOString(),
      status: 'revoked',
      value: { name: 'Creator' },
    });
    expect(twitterService.handleAuthorizationError).toHaveBeenCalledWith(
      credential.id,
      expect.anything(),
      expect.stringContaining('refresh'),
    );
  });

  it('treats X API tier limitations as permission-limited, not revoked', async () => {
    httpService.get.mockImplementation((url: string) =>
      url.includes('/users/me')
        ? of({
            data: {
              data: {
                id: 'user-1',
                name: 'Creator',
                username: 'creator',
              },
            },
          })
        : throwError(() => providerError(403, 'client-not-enrolled')),
    );

    const snapshot = await service.refresh({
      credentialId: credential.id,
      force: true,
      grantedScopes: fullScopes,
      organizationId: 'org-1',
    });

    expect(snapshot.state).toBe('partial');
    expect(evidenceOf(snapshot, 'owned-posts-snapshot')).toMatchObject({
      reason: 'missing_scope',
      status: 'permission_limited',
    });
    expect(twitterService.handleAuthorizationError).not.toHaveBeenCalled();
  });

  it('bounds rate-limit retries and returns the last successful snapshot as stale', async () => {
    const previous = makePreviousSnapshot();
    credentialsService.findOne.mockResolvedValueOnce({
      ...credential,
      warmupSignals: { twitterAuthorized: previous },
    });
    const rateLimitError = providerError(429, 'Too Many Requests', '0');
    httpService.get.mockReturnValue(throwError(() => rateLimitError));

    const refreshPromise = service.refresh({
      credentialId: credential.id,
      force: true,
      grantedScopes: fullScopes,
      organizationId: 'org-1',
    });
    await vi.runAllTimersAsync();
    const snapshot = await refreshPromise;

    expect(snapshot.state).toBe('partial');
    expect(httpService.get).toHaveBeenCalledTimes(4);
    expect(evidenceOf(snapshot, 'owned-posts-snapshot')).toMatchObject({
      reason: 'rate_limited',
      staleAt: now.toISOString(),
      status: 'stale',
      value: { posts: [{ id: 'tweet-1', likeCount: 4 }] },
    });
  });

  it('serves a fresh cached snapshot without issuing provider or database requests', async () => {
    const cached = makePreviousSnapshot();
    cacheService.get.mockResolvedValueOnce(cached);

    const snapshot = await service.refresh({
      credentialId: credential.id,
      organizationId: 'org-1',
    });

    expect(snapshot).toEqual(cached);
    expect(httpService.get).not.toHaveBeenCalled();
    expect(prisma.post.findMany).not.toHaveBeenCalled();
    expect(credentialsService.patch).not.toHaveBeenCalled();
    expect(credentialsService.mergeWarmupSignals).not.toHaveBeenCalled();
  });

  it('maps only canonical platform and Genfeed evidence keys', async () => {
    const snapshot = await service.refresh({
      credentialId: credential.id,
      force: true,
      grantedScopes: fullScopes,
      organizationId: 'org-1',
    });

    expect(snapshot.evidence.map((item) => item.key)).toEqual([
      'profile-completeness-signal',
      'profile-statistics-snapshot',
      'owned-posts-snapshot',
      'publishing-capability-snapshot',
      'first-upload-platform-signal',
      'owned-post-metrics-snapshot',
      'native-account-age',
      'genfeed-publish-activity',
    ]);
    expect(JSON.stringify(snapshot)).not.toMatch(
      /watch history|likes made|accounts followed|bookmarks|direct messages|timeline consumption|manual phone/i,
    );
  });

  it('marks a disconnected credential revoked without calling X', async () => {
    credentialsService.findOne.mockResolvedValueOnce({
      ...credential,
      isConnected: false,
    });

    const snapshot = await service.refresh({
      credentialId: credential.id,
      force: true,
      grantedScopes: fullScopes,
      organizationId: 'org-1',
    });

    expect(snapshot.state).toBe('revoked');
    expect(httpService.get).not.toHaveBeenCalled();
    expect(twitterService.getValidCredential).not.toHaveBeenCalled();
    expect(twitterService.refreshToken).not.toHaveBeenCalled();
    expect(evidenceOf(snapshot, 'profile-completeness-signal')).toMatchObject({
      reason: 'authorization_revoked',
      status: 'revoked',
    });
  });

  it('throws the canonical 404 for a missing or cross-organization credential', async () => {
    credentialsService.findOne.mockResolvedValueOnce(null);

    await expect(
      service.refresh({
        credentialId: 'credential-other-org',
        organizationId: 'org-2',
      }),
    ).rejects.toThrow(NotFoundException);
    expect(credentialsService.mergeWarmupSignals).not.toHaveBeenCalled();
  });

  it('looks up the credential with the Prisma Twitter platform label', async () => {
    await service.refresh({
      credentialId: credential.id,
      force: true,
      grantedScopes: fullScopes,
      organizationId: 'org-1',
    });

    expect(credentialsService.findOne).toHaveBeenCalledWith({
      id: credential.id,
      organizationId: 'org-1',
      platform: 'TWITTER',
    });
  });

  it('persists snapshots by merging only the X-owned warmup keys and enrollment rows', async () => {
    const snapshot = await service.refresh({
      credentialId: credential.id,
      force: true,
      grantedScopes: fullScopes,
      organizationId: 'org-1',
    });

    expect(credentialsService.patch).not.toHaveBeenCalled();
    expect(credentialsService.mergeWarmupSignals).toHaveBeenCalledWith(
      credential.id,
      'org-1',
      {
        twitterAuthorization: {
          grantedScopes: snapshot.grantedScopes,
          observedAt: snapshot.refreshAttemptedAt,
        },
        twitterAuthorized: snapshot,
      },
    );
    expect(
      enrollmentsService.syncTwitterAuthorizedSnapshot,
    ).toHaveBeenCalledWith({
      brandId: 'brand-1',
      credentialId: credential.id,
      organizationId: 'org-1',
      snapshot,
    });
  });

  it('uses a raw OAuth exchange token verbatim without decrypting it', async () => {
    await service.refresh({
      accessToken: 'raw-oauth-token',
      credentialId: credential.id,
      force: true,
      grantedScopes: fullScopes,
      organizationId: 'org-1',
    });

    expect(EncryptionUtil.decrypt).not.toHaveBeenCalled();
    expect(httpService.get).toHaveBeenCalledWith(
      expect.stringContaining('/users/me'),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer raw-oauth-token',
        }),
      }),
    );
  });

  it('decrypts only the persisted credential token when none is provided', async () => {
    await service.refresh({
      credentialId: credential.id,
      force: true,
      grantedScopes: fullScopes,
      organizationId: 'org-1',
    });

    expect(EncryptionUtil.decrypt).toHaveBeenCalledTimes(1);
    expect(EncryptionUtil.decrypt).toHaveBeenCalledWith('access-token');
  });

  it('bounds every X provider request with a timeout', async () => {
    await service.refresh({
      credentialId: credential.id,
      force: true,
      grantedScopes: fullScopes,
      organizationId: 'org-1',
    });

    for (const call of httpService.get.mock.calls) {
      expect(call[1]).toMatchObject({ timeout: 10_000 });
    }
    expect(httpService.get).toHaveBeenCalled();
  });

  it('omits the owned-post value entirely when tweet.read is not granted', async () => {
    const snapshot = await service.refresh({
      credentialId: credential.id,
      force: true,
      grantedScopes: [USERS_READ_SCOPE, TWEET_WRITE_SCOPE, MEDIA_WRITE_SCOPE],
      organizationId: 'org-1',
    });

    const posts = evidenceOf(snapshot, 'owned-posts-snapshot');
    expect(posts).toMatchObject({
      reason: 'missing_scope',
      status: 'permission_limited',
    });
    expect(posts).not.toHaveProperty('value');
    expect(
      evidenceOf(snapshot, 'publishing-capability-snapshot'),
    ).toMatchObject({
      status: 'available',
      value: { canPublish: true, canUploadMedia: true },
    });
  });
});
