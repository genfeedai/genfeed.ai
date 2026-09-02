vi.mock('@libs/utils/encryption/encryption.util', () => ({
  EncryptionUtil: {
    decrypt: vi.fn((value: string) => value),
  },
}));

import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { SocialWarmupEnrollmentsService } from '@api/collections/social-warmup-enrollments/services/social-warmup-enrollments.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { CacheService } from '@api/services/cache/cache.service';
import { YoutubeAuthService } from '@api/services/integrations/youtube/services/modules/youtube-auth.service';
import { YoutubeAuthorizedSignalsService } from '@api/services/integrations/youtube/services/youtube-authorized-signals.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  type YoutubeAuthorizedSignalEvidence,
  type YoutubeAuthorizedSignalsSnapshot,
  youtubeAuthorizedSignalsSnapshotSchema,
} from '@api-types/contracts/youtube-authorized-signals.contract';
import { CredentialPlatform, TargetExecutionState } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';

const now = new Date('2026-08-24T08:00:00.000Z');
const YOUTUBE_SCOPE = 'https://www.googleapis.com/auth/youtube';
const YOUTUBE_READONLY_SCOPE =
  'https://www.googleapis.com/auth/youtube.readonly';
const YOUTUBE_UPLOAD_SCOPE = 'https://www.googleapis.com/auth/youtube.upload';
const YT_ANALYTICS_READONLY_SCOPE =
  'https://www.googleapis.com/auth/yt-analytics.readonly';
const fullScopes = [
  YOUTUBE_SCOPE,
  YOUTUBE_READONLY_SCOPE,
  YOUTUBE_UPLOAD_SCOPE,
  YT_ANALYTICS_READONLY_SCOPE,
];

function providerError(code: number, reason: string, message = 'error') {
  return {
    response: {
      data: {
        error: {
          code,
          errors: [{ message, reason }],
          message,
        },
      },
      headers: {},
      status: code,
    },
  };
}

function evidenceOf(
  snapshot: YoutubeAuthorizedSignalsSnapshot,
  key: YoutubeAuthorizedSignalEvidence['key'],
) {
  const evidence = snapshot.evidence.find((item) => item.key === key);
  if (!evidence) {
    throw new Error(`Missing evidence ${key}`);
  }
  return evidence;
}

function makePreviousSnapshot(): YoutubeAuthorizedSignalsSnapshot {
  const scope = {
    granted: [YOUTUBE_READONLY_SCOPE],
    missing: [],
    required: [YOUTUBE_READONLY_SCOPE],
  };
  const common = {
    fieldAvailability: { id: 'available' as const },
    observedAt: '2026-08-23T08:00:00.000Z',
    provenance: 'platform_verified' as const,
    scope,
    staleAt: null,
    status: 'available' as const,
  };

  return youtubeAuthorizedSignalsSnapshotSchema.parse({
    credentialId: 'credential-1',
    evidence: [
      {
        ...common,
        key: 'channel-fields-platform-signal',
        value: { id: 'UC123', title: 'Creator' },
      },
      {
        ...common,
        key: 'owned-uploads-snapshot',
        value: {
          hasMore: false,
          videos: [{ id: 'video-1', likeCount: 12 }],
        },
      },
      {
        ...common,
        key: 'publishing-capability-snapshot',
        scope: {
          granted: [YOUTUBE_UPLOAD_SCOPE],
          missing: [],
          required: [YOUTUBE_UPLOAD_SCOPE],
        },
        value: { canPublish: true, channelId: 'UC123' },
      },
      {
        ...common,
        key: 'owned-video-analytics-snapshot',
        scope: {
          granted: [YT_ANALYTICS_READONLY_SCOPE],
          missing: [],
          required: [YT_ANALYTICS_READONLY_SCOPE],
        },
        value: { videos: [{ id: 'video-1', views: 40 }] },
      },
      {
        ...common,
        key: 'first-upload-platform-signal',
        value: { video: { id: 'video-1', likeCount: 12 } },
      },
      {
        ...common,
        key: 'native-account-age',
        value: {
          createdAt: '2026-01-01T00:00:00.000Z',
          createTime: 1_767_225_600,
        },
      },
      {
        fieldAvailability: { outcome: 'available' },
        key: 'genfeed-publish-outcomes-observed',
        observedAt: '2026-08-23T08:00:00.000Z',
        provenance: 'genfeed_observed',
        scope: { granted: [], missing: [], required: [] },
        staleAt: null,
        status: 'empty',
        value: { attempts: [] },
      },
    ],
    grantedScopes: fullScopes,
    platform: CredentialPlatform.YOUTUBE,
    refreshAttemptedAt: '2026-08-23T08:00:00.000Z',
    state: 'full',
  });
}

describe('YoutubeAuthorizedSignalsService', () => {
  let service: YoutubeAuthorizedSignalsService;
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
  let youtubeAuthService: {
    refreshToken: ReturnType<typeof vi.fn>;
  };
  let enrollmentsService: {
    syncYoutubeAuthorizedSnapshot: ReturnType<typeof vi.fn>;
  };

  const credential = {
    accessToken: 'access-token',
    accessTokenExpiry: new Date('2026-08-25T08:00:00.000Z'),
    brandId: 'brand-1',
    externalId: 'UC123',
    grantedScopes: fullScopes,
    id: 'credential-1',
    isConnected: true,
    isDeleted: false,
    organizationId: 'org-1',
    platform: CredentialPlatform.YOUTUBE,
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
        if (url.includes('/playlistItems')) {
          return of({
            data: {
              items: [
                {
                  contentDetails: { videoId: 'video-1' },
                  snippet: {
                    publishedAt: '2026-08-10T12:00:00Z',
                    title: 'First Short',
                  },
                },
              ],
            },
          });
        }
        if (url.includes('/videos')) {
          return of({
            data: {
              items: [
                {
                  contentDetails: { duration: 'PT45S' },
                  id: 'video-1',
                  snippet: {
                    publishedAt: '2026-08-10T12:00:00Z',
                    title: 'First Short',
                  },
                  statistics: {
                    commentCount: '2',
                    likeCount: '4',
                    viewCount: '40',
                  },
                },
              ],
            },
          });
        }
        if (url.includes('youtubeanalytics')) {
          return of({
            data: {
              columnHeaders: [
                { name: 'video' },
                { name: 'views' },
                { name: 'averageViewDuration' },
                { name: 'averageViewPercentage' },
                { name: 'impressions' },
                { name: 'impressionsClickThroughRate' },
              ],
              rows: [['video-1', 40, 20, 60, 800, 0.05]],
            },
          });
        }

        return of({
          data: {
            items: [
              {
                contentDetails: { relatedPlaylists: { uploads: 'UU123' } },
                id: 'UC123',
                snippet: {
                  customUrl: '@creator',
                  description: 'Niche channel',
                  publishedAt: '2026-01-01T00:00:00Z',
                  thumbnails: {
                    high: { url: 'https://youtube.example/avatar.jpg' },
                  },
                  title: 'Creator',
                },
                statistics: {
                  hiddenSubscriberCount: false,
                  subscriberCount: '12',
                  videoCount: '1',
                  viewCount: '40',
                },
                status: {
                  isLinked: true,
                  longUploadsStatus: 'allowed',
                  privacyStatus: 'public',
                },
              },
            ],
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
    youtubeAuthService = {
      refreshToken: vi.fn().mockResolvedValue({
        credentials: { access_token: 'refreshed-token' },
      }),
    };
    enrollmentsService = {
      syncYoutubeAuthorizedSnapshot: vi.fn().mockResolvedValue(undefined),
    };

    service = new YoutubeAuthorizedSignalsService(
      cacheService as unknown as CacheService,
      credentialsService as unknown as CredentialsService,
      httpService as unknown as HttpService,
      { log: vi.fn(), warn: vi.fn() } as unknown as LoggerService,
      prisma as unknown as PrismaService,
      enrollmentsService as unknown as SocialWarmupEnrollmentsService,
      youtubeAuthService as unknown as YoutubeAuthService,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('maps full authorized channel, owned uploads, publishing, analytics, and Genfeed outcomes', async () => {
    const snapshot = await service.refresh({
      credentialId: credential.id,
      force: true,
      grantedScopes: fullScopes,
      organizationId: 'org-1',
    });

    expect(snapshot.state).toBe('full');
    expect(snapshot.grantedScopes).toEqual([...fullScopes].sort());
    expect(
      evidenceOf(snapshot, 'channel-fields-platform-signal'),
    ).toMatchObject({
      provenance: 'platform_verified',
      status: 'available',
      value: { id: 'UC123', title: 'Creator', customUrl: '@creator' },
    });
    expect(evidenceOf(snapshot, 'owned-uploads-snapshot')).toMatchObject({
      value: { videos: [{ id: 'video-1', mediaType: 'short', likeCount: 4 }] },
    });
    expect(
      evidenceOf(snapshot, 'publishing-capability-snapshot'),
    ).toMatchObject({
      status: 'available',
      value: { canPublish: true, channelId: 'UC123' },
    });
    expect(
      evidenceOf(snapshot, 'owned-video-analytics-snapshot'),
    ).toMatchObject({
      provenance: 'platform_verified',
      value: {
        videos: [
          {
            id: 'video-1',
            views: 40,
            averageViewDurationSeconds: 20,
            impressionsClickThroughRate: 0.05,
          },
        ],
      },
    });
    expect(evidenceOf(snapshot, 'first-upload-platform-signal')).toMatchObject({
      provenance: 'platform_verified',
      value: { video: { id: 'video-1' } },
    });
    expect(evidenceOf(snapshot, 'native-account-age')).toMatchObject({
      provenance: 'platform_verified',
      value: { createdAt: '2026-01-01T00:00:00.000Z' },
    });
    expect(
      evidenceOf(snapshot, 'genfeed-publish-outcomes-observed'),
    ).toMatchObject({
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
    expect(
      enrollmentsService.syncYoutubeAuthorizedSnapshot,
    ).toHaveBeenCalledWith({
      brandId: 'brand-1',
      credentialId: credential.id,
      organizationId: 'org-1',
      snapshot,
    });
  });

  it('keeps missing analytics scopes permission-limited without inventing zeros', async () => {
    const snapshot = await service.refresh({
      credentialId: credential.id,
      force: true,
      grantedScopes: [YOUTUBE_SCOPE, YOUTUBE_UPLOAD_SCOPE],
      organizationId: 'org-1',
    });

    expect(snapshot.state).toBe('partial');
    expect(
      evidenceOf(snapshot, 'channel-fields-platform-signal'),
    ).toMatchObject({
      status: 'available',
      value: { title: 'Creator' },
    });
    expect(
      evidenceOf(snapshot, 'owned-video-analytics-snapshot'),
    ).toMatchObject({
      reason: 'missing_scope',
      scope: {
        granted: [],
        missing: [YT_ANALYTICS_READONLY_SCOPE],
        required: [YT_ANALYTICS_READONLY_SCOPE],
      },
      status: 'permission_limited',
    });
    expect(
      evidenceOf(snapshot, 'owned-video-analytics-snapshot'),
    ).not.toHaveProperty('value');
    expect(
      httpService.get.mock.calls.some((call) =>
        String(call[0]).includes('youtubeanalytics'),
      ),
    ).toBe(false);
  });

  it('records a skipped YouTube channel fetch as missing_scope, not empty_response', async () => {
    const snapshot = await service.refresh({
      credentialId: credential.id,
      force: true,
      grantedScopes: [YOUTUBE_UPLOAD_SCOPE],
      organizationId: 'org-1',
    });

    expect(snapshot.state).toBe('partial');
    expect(
      evidenceOf(snapshot, 'channel-fields-platform-signal'),
    ).toMatchObject({
      reason: 'missing_scope',
      status: 'permission_limited',
    });
    expect(evidenceOf(snapshot, 'owned-uploads-snapshot')).toMatchObject({
      reason: 'missing_scope',
      status: 'permission_limited',
    });
    expect(evidenceOf(snapshot, 'native-account-age')).toMatchObject({
      reason: 'missing_scope',
      status: 'permission_limited',
    });
    expect(
      httpService.get.mock.calls.some((call) =>
        String(call[0]).includes('/channels'),
      ),
    ).toBe(false);
  });

  it('preserves empty_response when a permitted channel request returns no channel', async () => {
    httpService.get.mockImplementation((url: string) => {
      if (url.includes('/channels')) {
        return of({ data: { items: [] } });
      }
      return of({ data: { items: [] } });
    });

    const snapshot = await service.refresh({
      credentialId: credential.id,
      force: true,
      grantedScopes: fullScopes,
      organizationId: 'org-1',
    });

    expect(
      evidenceOf(snapshot, 'channel-fields-platform-signal'),
    ).toMatchObject({
      reason: 'empty_response',
      status: 'empty',
    });
    expect(
      httpService.get.mock.calls.some((call) =>
        String(call[0]).includes('/channels'),
      ),
    ).toBe(true);
  });

  it('treats missing brand-account channel selection as recoverable, not failed', async () => {
    httpService.get.mockImplementation((url: string) => {
      if (url.includes('/channels')) {
        return of({
          data: {
            items: [
              { id: 'UC-A', snippet: { title: 'A' } },
              { id: 'UC-B', snippet: { title: 'B' } },
            ],
          },
        });
      }
      return of({ data: { items: [] } });
    });
    credentialsService.findOne.mockResolvedValueOnce({
      ...credential,
      externalId: null,
    });

    const snapshot = await service.refresh({
      credentialId: credential.id,
      force: true,
      grantedScopes: fullScopes,
      organizationId: 'org-1',
    });

    expect(snapshot.state).toBe('partial');
    expect(
      evidenceOf(snapshot, 'channel-fields-platform-signal'),
    ).toMatchObject({
      reason: 'channel_selection_required',
      status: 'permission_limited',
    });
    expect(
      httpService.get.mock.calls.some((call) =>
        String(call[0]).includes('/playlistItems'),
      ),
    ).toBe(false);
  });

  it('maps an empty uploads playlist as empty, not failed', async () => {
    httpService.get.mockImplementation((url: string) => {
      if (url.includes('/playlistItems')) {
        return of({ data: { items: [] } });
      }
      if (url.includes('youtubeanalytics')) {
        return of({ data: { columnHeaders: [{ name: 'video' }], rows: [] } });
      }
      if (url.includes('/videos')) {
        return of({ data: { items: [] } });
      }
      return of({
        data: {
          items: [
            {
              contentDetails: { relatedPlaylists: { uploads: 'UU123' } },
              id: 'UC123',
              snippet: {
                publishedAt: '2026-01-01T00:00:00Z',
                title: 'Creator',
              },
              statistics: { videoCount: '0' },
              status: { privacyStatus: 'public' },
            },
          ],
        },
      });
    });

    const snapshot = await service.refresh({
      credentialId: credential.id,
      force: true,
      grantedScopes: fullScopes,
      organizationId: 'org-1',
    });

    expect(snapshot.state).toBe('empty');
    expect(evidenceOf(snapshot, 'owned-uploads-snapshot').status).toBe('empty');
  });

  it('preserves the last successful values as revoked and stale-dated on token revocation', async () => {
    const previous = makePreviousSnapshot();
    credentialsService.findOne.mockResolvedValueOnce({
      ...credential,
      warmupSignals: { youtubeAuthorized: previous },
    });
    httpService.get.mockReturnValue(
      throwError(() => providerError(401, 'authError', 'Invalid Credentials')),
    );

    const snapshot = await service.refresh({
      credentialId: credential.id,
      force: true,
      grantedScopes: fullScopes,
      organizationId: 'org-1',
    });

    expect(snapshot.state).toBe('revoked');
    expect(
      evidenceOf(snapshot, 'channel-fields-platform-signal'),
    ).toMatchObject({
      observedAt: '2026-08-23T08:00:00.000Z',
      reason: 'authorization_revoked',
      staleAt: now.toISOString(),
      status: 'revoked',
      value: { title: 'Creator' },
    });
  });

  it('returns the last successful snapshot as stale on provider errors', async () => {
    const previous = makePreviousSnapshot();
    credentialsService.findOne.mockResolvedValueOnce({
      ...credential,
      warmupSignals: { youtubeAuthorized: previous },
    });
    httpService.get.mockReturnValue(
      throwError(() => providerError(500, 'backendError', 'Unknown error')),
    );

    const snapshot = await service.refresh({
      credentialId: credential.id,
      force: true,
      grantedScopes: fullScopes,
      organizationId: 'org-1',
    });

    expect(snapshot.state).toBe('stale');
    expect(evidenceOf(snapshot, 'owned-uploads-snapshot')).toMatchObject({
      reason: 'provider_error',
      staleAt: now.toISOString(),
      status: 'stale',
      value: { videos: [{ id: 'video-1', likeCount: 12 }] },
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
      'channel-fields-platform-signal',
      'owned-uploads-snapshot',
      'publishing-capability-snapshot',
      'owned-video-analytics-snapshot',
      'first-upload-platform-signal',
      'native-account-age',
      'genfeed-publish-outcomes-observed',
    ]);
    expect(JSON.stringify(snapshot)).not.toMatch(
      /watch history|subscriptions made|likes made|comments made|search activity|homepage|home feed/i,
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
    expect(
      enrollmentsService.syncYoutubeAuthorizedSnapshot,
    ).not.toHaveBeenCalled();
  });

  it('persists snapshots by merging only the YouTube-owned warmup keys', async () => {
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
        youtubeAuthorization: {
          grantedScopes: snapshot.grantedScopes,
          observedAt: snapshot.refreshAttemptedAt,
        },
        youtubeAuthorized: snapshot,
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
    expect(youtubeAuthService.refreshToken).not.toHaveBeenCalled();
    expect(httpService.get).toHaveBeenCalledWith(
      expect.stringContaining('/channels'),
      expect.objectContaining({
        headers: { Authorization: 'Bearer raw-oauth-token' },
      }),
    );
  });
});
