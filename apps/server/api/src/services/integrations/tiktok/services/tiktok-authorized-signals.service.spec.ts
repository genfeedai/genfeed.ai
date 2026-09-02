vi.mock('@libs/utils/encryption/encryption.util', () => ({
  EncryptionUtil: {
    decrypt: vi.fn((value: string) => value),
  },
}));

import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { SocialWarmupEnrollmentsService } from '@api/collections/social-warmup-enrollments/services/social-warmup-enrollments.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { CacheService } from '@api/services/cache/cache.service';
import { TiktokService } from '@api/services/integrations/tiktok/services/tiktok.service';
import { TiktokAuthorizedSignalsService } from '@api/services/integrations/tiktok/services/tiktok-authorized-signals.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { CredentialPlatform, TargetExecutionState } from '@genfeedai/contracts';
import {
  type TikTokAuthorizedSignalEvidence,
  type TikTokAuthorizedSignalsSnapshot,
  tiktokAuthorizedSignalsSnapshotSchema,
} from '@genfeedai/contracts/api-types/contracts/tiktok-authorized-signals.contract';
import { LoggerService } from '@libs/logger/logger.service';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';

const now = new Date('2026-08-12T08:00:00.000Z');
const USER_BASIC_SCOPE = 'user.info.basic';
const USER_STATS_SCOPE = 'user.info.stats';
const fullScopes = [
  'user.info.basic',
  'user.info.profile',
  'user.info.stats',
  'video.list',
  'video.upload',
  'video.publish',
];

function providerError(code: string, status = 400, retryAfter?: string) {
  return {
    response: {
      data: { error: { code } },
      headers: retryAfter === undefined ? {} : { 'retry-after': retryAfter },
      status,
    },
  };
}

function evidenceOf(
  snapshot: TikTokAuthorizedSignalsSnapshot,
  key: TikTokAuthorizedSignalEvidence['key'],
) {
  const evidence = snapshot.evidence.find((item) => item.key === key);
  if (!evidence) {
    throw new Error(`Missing evidence ${key}`);
  }
  return evidence;
}

function makePreviousSnapshot(): TikTokAuthorizedSignalsSnapshot {
  const scope = {
    granted: ['video.list'],
    missing: [],
    required: ['video.list'],
  };
  const common = {
    fieldAvailability: { id: 'available' as const },
    observedAt: '2026-08-11T08:00:00.000Z',
    provenance: 'platform_verified' as const,
    scope,
    staleAt: null,
    status: 'available' as const,
  };

  return tiktokAuthorizedSignalsSnapshotSchema.parse({
    credentialId: 'credential-1',
    evidence: [
      {
        ...common,
        key: 'profile-completeness-signal',
        scope: {
          granted: ['user.info.basic', 'user.info.profile'],
          missing: [],
          required: ['user.info.basic', 'user.info.profile'],
        },
        value: { displayName: 'Creator' },
      },
      {
        ...common,
        key: 'profile-statistics-snapshot',
        scope: {
          granted: ['user.info.stats'],
          missing: [],
          required: ['user.info.stats'],
        },
        value: { followerCount: 10, videoCount: 1 },
      },
      {
        ...common,
        key: 'public-videos-snapshot',
        value: {
          hasMore: false,
          videos: [{ id: 'video-1', viewCount: 12 }],
        },
      },
      {
        ...common,
        key: 'creator-capabilities-snapshot',
        scope: {
          granted: ['video.publish'],
          missing: [],
          required: ['video.publish'],
        },
        value: { privacyLevelOptions: ['SELF_ONLY'] },
      },
      {
        ...common,
        key: 'first-upload-platform-signal',
        value: { video: { id: 'video-1', viewCount: 12 } },
      },
      {
        ...common,
        key: 'owned-post-metrics-snapshot',
        value: { videos: [{ id: 'video-1', viewCount: 12 }] },
      },
      {
        fieldAvailability: { outcome: 'available' },
        key: 'genfeed-publish-activity',
        observedAt: '2026-08-11T08:00:00.000Z',
        provenance: 'genfeed_observed',
        scope: { granted: [], missing: [], required: [] },
        staleAt: null,
        status: 'empty',
        value: { attempts: [] },
      },
    ],
    grantedScopes: fullScopes,
    platform: CredentialPlatform.TIKTOK,
    refreshAttemptedAt: '2026-08-11T08:00:00.000Z',
    state: 'full',
  });
}

describe('TiktokAuthorizedSignalsService', () => {
  let service: TiktokAuthorizedSignalsService;
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
    post: ReturnType<typeof vi.fn>;
  };
  let prisma: {
    post: { findMany: ReturnType<typeof vi.fn> };
  };
  let tiktokService: {
    getValidCredential: ReturnType<typeof vi.fn>;
    handleAuthorizationError: ReturnType<typeof vi.fn>;
    refreshToken: ReturnType<typeof vi.fn>;
  };

  const credential = {
    accessToken: 'access-token',
    accessTokenExpiry: new Date('2026-08-13T08:00:00.000Z'),
    brandId: 'brand-1',
    id: 'credential-1',
    isConnected: true,
    isDeleted: false,
    organizationId: 'org-1',
    platform: CredentialPlatform.TIKTOK,
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
      get: vi.fn().mockReturnValue(
        of({
          data: {
            data: {
              user: {
                avatar_url: 'https://tiktok.example/avatar.jpg',
                bio_description: 'Niche creator',
                display_name: 'Creator',
                follower_count: 0,
                following_count: 4,
                is_verified: false,
                likes_count: 0,
                profile_deep_link: 'https://www.tiktok.com/@creator',
                username: 'creator',
                video_count: 1,
              },
            },
          },
        }),
      ),
      post: vi.fn().mockImplementation((url: string) => {
        if (url.includes('/video/list/')) {
          return of({
            data: {
              data: {
                has_more: false,
                videos: [
                  {
                    comment_count: 0,
                    create_time: 1_723_000_000,
                    duration: 20,
                    id: 'video-1',
                    like_count: 0,
                    share_count: 0,
                    share_url: 'https://www.tiktok.com/video-1',
                    title: 'First upload',
                    video_description: 'Original post',
                    view_count: 0,
                  },
                ],
              },
            },
          });
        }

        return of({
          data: {
            data: {
              comment_disabled: true,
              creator_nickname: 'Creator',
              creator_username: 'creator',
              duet_disabled: false,
              max_video_post_duration_sec: 0,
              privacy_level_options: ['SELF_ONLY'],
              stitch_disabled: true,
            },
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
    tiktokService = {
      getValidCredential: vi.fn().mockResolvedValue(credential),
      handleAuthorizationError: vi.fn().mockResolvedValue(false),
      refreshToken: vi.fn().mockResolvedValue(credential),
    };

    service = new TiktokAuthorizedSignalsService(
      cacheService as unknown as CacheService,
      credentialsService as unknown as CredentialsService,
      httpService as unknown as HttpService,
      { log: vi.fn() } as unknown as LoggerService,
      prisma as unknown as PrismaService,
      tiktokService as unknown as TiktokService,
      {
        syncTikTokAuthorizedSnapshot: vi.fn().mockResolvedValue(undefined),
      } as unknown as SocialWarmupEnrollmentsService,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('maps full authorized profile, counts, owned videos, creator restrictions, and Genfeed outcomes', async () => {
    const snapshot = await service.refresh({
      credentialId: credential.id,
      force: true,
      grantedScopes: fullScopes,
      organizationId: 'org-1',
    });

    expect(snapshot.state).toBe('full');
    expect(snapshot.grantedScopes).toEqual([...fullScopes].sort());
    expect(evidenceOf(snapshot, 'profile-statistics-snapshot')).toMatchObject({
      provenance: 'platform_verified',
      status: 'available',
      value: { followerCount: 0, likesCount: 0, videoCount: 1 },
    });
    expect(evidenceOf(snapshot, 'public-videos-snapshot')).toMatchObject({
      scope: {
        granted: ['video.list'],
        missing: [],
        required: ['video.list'],
      },
      value: { videos: [{ id: 'video-1', viewCount: 0 }] },
    });
    expect(evidenceOf(snapshot, 'creator-capabilities-snapshot')).toMatchObject(
      {
        value: {
          commentDisabled: true,
          duetDisabled: false,
          maxVideoPostDurationSeconds: 0,
          stitchDisabled: true,
        },
      },
    );
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
      grantedScopes: [USER_BASIC_SCOPE],
      organizationId: 'org-1',
    });

    expect(snapshot.state).toBe('partial');
    expect(evidenceOf(snapshot, 'profile-completeness-signal')).toMatchObject({
      fieldAvailability: {
        displayName: 'available',
        username: 'permission_limited',
      },
      status: 'permission_limited',
    });
    expect(evidenceOf(snapshot, 'profile-statistics-snapshot')).toMatchObject({
      reason: 'missing_scope',
      scope: {
        granted: [],
        missing: [USER_STATS_SCOPE],
        required: [USER_STATS_SCOPE],
      },
      status: 'permission_limited',
    });
    expect(
      evidenceOf(snapshot, 'profile-statistics-snapshot'),
    ).not.toHaveProperty('value');
    expect(evidenceOf(snapshot, 'public-videos-snapshot')).toMatchObject({
      reason: 'missing_scope',
      status: 'permission_limited',
    });
    expect(httpService.get).toHaveBeenCalledWith(
      expect.stringContaining('/user/info/'),
      expect.objectContaining({
        params: { fields: 'avatar_url,display_name' },
      }),
    );
  });

  it('does not call TikTok data endpoints when no data scopes were granted', async () => {
    const snapshot = await service.refresh({
      credentialId: credential.id,
      force: true,
      grantedScopes: [],
      organizationId: 'org-1',
    });

    expect(snapshot.state).toBe('partial');
    expect(httpService.get).not.toHaveBeenCalled();
    expect(httpService.post).not.toHaveBeenCalled();
    for (const evidence of snapshot.evidence.filter(
      (item) => item.provenance === 'platform_verified',
    )) {
      expect(evidence.status).toBe('permission_limited');
      expect(evidence.reason).toBe('missing_scope');
    }
  });

  it('discovers exact scopes once through token refresh for pre-existing connections', async () => {
    credentialsService.findOne.mockResolvedValueOnce({
      ...credential,
      refreshToken: 'refresh-token',
    });
    tiktokService.refreshToken.mockResolvedValueOnce({
      ...credential,
      refreshToken: 'refresh-token',
      warmupSignals: {
        tiktokAuthorization: { grantedScopes: [USER_BASIC_SCOPE] },
      },
    });

    const snapshot = await service.refresh({
      credentialId: credential.id,
      force: true,
      organizationId: 'org-1',
    });

    expect(tiktokService.refreshToken).toHaveBeenCalledWith(
      'org-1',
      'brand-1',
      credential.id,
    );
    expect(tiktokService.getValidCredential).not.toHaveBeenCalled();
    expect(snapshot.grantedScopes).toEqual([USER_BASIC_SCOPE]);
    expect(httpService.get).toHaveBeenCalledTimes(1);
    expect(httpService.post).not.toHaveBeenCalled();
  });

  it('marks returned-field gaps unavailable while preserving valid false and zero values', async () => {
    httpService.get.mockReturnValueOnce(
      of({
        data: {
          data: {
            user: {
              display_name: 'Creator',
              follower_count: 0,
              is_verified: false,
            },
          },
        },
      }),
    );

    const snapshot = await service.refresh({
      credentialId: credential.id,
      force: true,
      grantedScopes: fullScopes,
      organizationId: 'org-1',
    });

    expect(evidenceOf(snapshot, 'profile-completeness-signal')).toMatchObject({
      fieldAvailability: {
        displayName: 'available',
        isVerified: 'available',
        username: 'unavailable',
      },
      value: { displayName: 'Creator', isVerified: false },
    });
    expect(evidenceOf(snapshot, 'profile-statistics-snapshot')).toMatchObject({
      fieldAvailability: {
        followerCount: 'available',
        followingCount: 'unavailable',
      },
      value: { followerCount: 0 },
    });
  });

  it('represents an authorized empty account distinctly', async () => {
    httpService.get.mockReturnValueOnce(
      of({
        data: {
          data: {
            user: {
              avatar_url: 'https://tiktok.example/avatar.jpg',
              bio_description: '',
              display_name: 'New creator',
              follower_count: 0,
              following_count: 0,
              is_verified: false,
              likes_count: 0,
              profile_deep_link: 'https://www.tiktok.com/@new-creator',
              username: 'new-creator',
              video_count: 0,
            },
          },
        },
      }),
    );
    httpService.post.mockImplementation((url: string) =>
      url.includes('/video/list/')
        ? of({ data: { data: { has_more: false, videos: [] } } })
        : of({
            data: {
              data: {
                comment_disabled: false,
                creator_nickname: 'New creator',
                creator_username: 'new-creator',
                duet_disabled: false,
                max_video_post_duration_sec: 600,
                privacy_level_options: ['SELF_ONLY'],
                stitch_disabled: false,
              },
            },
          }),
    );
    prisma.post.findMany.mockResolvedValueOnce([]);

    const snapshot = await service.refresh({
      credentialId: credential.id,
      force: true,
      grantedScopes: fullScopes,
      organizationId: 'org-1',
    });

    expect(snapshot.state).toBe('empty');
    expect(evidenceOf(snapshot, 'public-videos-snapshot')).toMatchObject({
      status: 'empty',
      value: { videos: [] },
    });
    expect(evidenceOf(snapshot, 'genfeed-publish-activity').status).toBe(
      'empty',
    );
  });

  it('preserves the last successful values as revoked and stale-dated on token revocation', async () => {
    const previous = makePreviousSnapshot();
    credentialsService.findOne.mockResolvedValueOnce({
      ...credential,
      warmupSignals: { tiktokAuthorized: previous },
    });
    httpService.get.mockReturnValueOnce(
      throwError(() => providerError('access_token_invalid', 401)),
    );
    tiktokService.handleAuthorizationError.mockResolvedValueOnce(true);

    const snapshot = await service.refresh({
      credentialId: credential.id,
      force: true,
      grantedScopes: fullScopes,
      organizationId: 'org-1',
    });

    expect(snapshot.state).toBe('revoked');
    expect(evidenceOf(snapshot, 'profile-completeness-signal')).toMatchObject({
      observedAt: '2026-08-11T08:00:00.000Z',
      reason: 'authorization_revoked',
      staleAt: now.toISOString(),
      status: 'revoked',
      value: { displayName: 'Creator' },
    });
    expect(tiktokService.handleAuthorizationError).toHaveBeenCalledWith(
      credential.id,
      expect.anything(),
      expect.stringContaining('refresh'),
    );
  });

  it('bounds rate-limit retries and returns the last successful snapshot as stale', async () => {
    const previous = makePreviousSnapshot();
    credentialsService.findOne.mockResolvedValueOnce({
      ...credential,
      warmupSignals: { tiktokAuthorized: previous },
    });
    const rateLimitError = providerError('rate_limit_exceeded', 429, '0');
    httpService.get.mockReturnValue(throwError(() => rateLimitError));
    httpService.post.mockReturnValue(throwError(() => rateLimitError));

    const refreshPromise = service.refresh({
      credentialId: credential.id,
      force: true,
      grantedScopes: fullScopes,
      organizationId: 'org-1',
    });
    await vi.runAllTimersAsync();
    const snapshot = await refreshPromise;

    expect(snapshot.state).toBe('stale');
    expect(httpService.get).toHaveBeenCalledTimes(2);
    expect(httpService.post).toHaveBeenCalledTimes(4);
    expect(evidenceOf(snapshot, 'public-videos-snapshot')).toMatchObject({
      reason: 'rate_limited',
      staleAt: now.toISOString(),
      status: 'stale',
      value: { videos: [{ id: 'video-1', viewCount: 12 }] },
    });
  });

  it('treats creator scope rejection as permission-limited, not revoked', async () => {
    httpService.post.mockImplementation((url: string) =>
      url.includes('/video/list/')
        ? of({ data: { data: { has_more: false, videos: [] } } })
        : throwError(() => providerError('scope_not_authorized', 401)),
    );

    const snapshot = await service.refresh({
      credentialId: credential.id,
      force: true,
      grantedScopes: fullScopes,
      organizationId: 'org-1',
    });

    expect(snapshot.state).toBe('partial');
    expect(evidenceOf(snapshot, 'creator-capabilities-snapshot')).toMatchObject(
      {
        reason: 'missing_scope',
        scope: {
          granted: ['video.upload'],
          missing: ['video.publish'],
          required: ['video.publish'],
        },
        status: 'permission_limited',
      },
    );
    expect(tiktokService.handleAuthorizationError).not.toHaveBeenCalled();
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
    expect(httpService.post).not.toHaveBeenCalled();
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
      'public-videos-snapshot',
      'creator-capabilities-snapshot',
      'first-upload-platform-signal',
      'owned-post-metrics-snapshot',
      'genfeed-publish-activity',
    ]);
    expect(JSON.stringify(snapshot)).not.toMatch(
      /watch history|for you page|likes made|saves|comments made|accounts followed|scroll duration|manual phone/i,
    );
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

  it('persists snapshots by merging only the TikTok-owned warmup keys', async () => {
    const snapshot = await service.refresh({
      credentialId: credential.id,
      force: true,
      grantedScopes: fullScopes,
      organizationId: 'org-1',
    });

    // A full-object patch built from the stale credential read would erase
    // keys written concurrently by other warmup writers; only the atomic
    // per-key merge may be used.
    expect(credentialsService.patch).not.toHaveBeenCalled();
    expect(credentialsService.mergeWarmupSignals).toHaveBeenCalledWith(
      credential.id,
      'org-1',
      {
        tiktokAuthorization: {
          grantedScopes: snapshot.grantedScopes,
          observedAt: snapshot.refreshAttemptedAt,
        },
        tiktokAuthorized: snapshot,
      },
    );
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
      expect.stringContaining('/user/info/'),
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

  it('bounds every TikTok provider request with a timeout', async () => {
    await service.refresh({
      credentialId: credential.id,
      force: true,
      grantedScopes: fullScopes,
      organizationId: 'org-1',
    });

    for (const call of httpService.get.mock.calls) {
      expect(call[1]).toMatchObject({ timeout: 10_000 });
    }
    for (const call of httpService.post.mock.calls) {
      expect(call[2]).toMatchObject({ timeout: 10_000 });
    }
    expect(httpService.get).toHaveBeenCalled();
    expect(httpService.post).toHaveBeenCalled();
  });

  it('omits the profile value entirely when no profile scope is granted', async () => {
    const snapshot = await service.refresh({
      credentialId: credential.id,
      force: true,
      grantedScopes: [USER_STATS_SCOPE],
      organizationId: 'org-1',
    });

    // Stats-only grants still run the user-info request, but the profile
    // evidence must match the statistics builder's permission-limited shape.
    const profile = evidenceOf(snapshot, 'profile-completeness-signal');
    expect(profile).toMatchObject({
      reason: 'missing_scope',
      status: 'permission_limited',
    });
    expect(profile).not.toHaveProperty('value');
    expect(evidenceOf(snapshot, 'profile-statistics-snapshot')).toMatchObject({
      status: 'available',
      value: { followerCount: 0, videoCount: 1 },
    });
  });
});
