vi.mock('@libs/utils/encryption/encryption.util', () => ({
  EncryptionUtil: {
    decrypt: vi.fn((value: string) => value),
  },
}));

import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { SocialWarmupEnrollmentsService } from '@api/collections/social-warmup-enrollments/services/social-warmup-enrollments.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { CacheService } from '@api/services/cache/cache.service';
import { InstagramService } from '@api/services/integrations/instagram/services/instagram.service';
import { InstagramAuthorizedSignalsService } from '@api/services/integrations/instagram/services/instagram-authorized-signals.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  type InstagramAuthorizedSignalEvidence,
  type InstagramAuthorizedSignalsSnapshot,
  instagramAuthorizedSignalsSnapshotSchema,
} from '@api-types/contracts/instagram-authorized-signals.contract';
import { CredentialPlatform, TargetExecutionState } from '@genfeedai/enums';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';

const now = new Date('2026-08-12T08:00:00.000Z');
const BASIC_SCOPE = 'instagram_basic';
const PUBLISH_SCOPE = 'instagram_content_publish';
const INSIGHTS_SCOPE = 'instagram_manage_insights';
const PAGES_SCOPE = 'pages_show_list';
const fullScopes = [
  BASIC_SCOPE,
  PUBLISH_SCOPE,
  INSIGHTS_SCOPE,
  PAGES_SCOPE,
  'pages_read_engagement',
];

function providerError(code: number, message = 'error', status = 400) {
  return {
    response: {
      data: { error: { code, message } },
      headers: {},
      status,
    },
  };
}

function evidenceOf(
  snapshot: InstagramAuthorizedSignalsSnapshot,
  key: InstagramAuthorizedSignalEvidence['key'],
) {
  const evidence = snapshot.evidence.find((item) => item.key === key);
  if (!evidence) {
    throw new Error(`Missing evidence ${key}`);
  }
  return evidence;
}

function makePreviousSnapshot(): InstagramAuthorizedSignalsSnapshot {
  const scope = {
    granted: [BASIC_SCOPE],
    missing: [],
    required: [BASIC_SCOPE],
  };
  const common = {
    fieldAvailability: { id: 'available' as const },
    observedAt: '2026-08-11T08:00:00.000Z',
    provenance: 'platform_verified' as const,
    scope,
    staleAt: null,
    status: 'available' as const,
  };

  return instagramAuthorizedSignalsSnapshotSchema.parse({
    credentialId: 'credential-1',
    evidence: [
      {
        ...common,
        key: 'profile-fields-platform-signal',
        value: { username: 'creator', accountType: 'BUSINESS' },
      },
      {
        ...common,
        key: 'owned-media-snapshot',
        value: {
          hasMore: false,
          media: [{ id: 'media-1', likeCount: 12 }],
        },
      },
      {
        ...common,
        key: 'publishing-capability-snapshot',
        scope: {
          granted: [PUBLISH_SCOPE],
          missing: [],
          required: [PUBLISH_SCOPE],
        },
        value: {
          accountType: 'BUSINESS',
          canPublish: true,
          isProfessionalAccount: true,
        },
      },
      {
        ...common,
        key: 'media-performance-snapshot',
        scope: {
          granted: [INSIGHTS_SCOPE],
          missing: [],
          required: [INSIGHTS_SCOPE],
        },
        value: { media: [{ id: 'media-1', likeCount: 12 }] },
      },
      {
        ...common,
        key: 'first-publish-platform-signal',
        value: { media: { id: 'media-1', likeCount: 12 } },
      },
      {
        fieldAvailability: { outcome: 'available' },
        key: 'genfeed-publish-outcomes-observed',
        observedAt: '2026-08-11T08:00:00.000Z',
        provenance: 'genfeed_observed',
        scope: { granted: [], missing: [], required: [] },
        staleAt: null,
        status: 'empty',
        value: { attempts: [] },
      },
    ],
    grantedScopes: fullScopes,
    platform: CredentialPlatform.INSTAGRAM,
    refreshAttemptedAt: '2026-08-11T08:00:00.000Z',
    state: 'full',
  });
}

describe('InstagramAuthorizedSignalsService', () => {
  let service: InstagramAuthorizedSignalsService;
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
  let instagramService: {
    getValidCredential: ReturnType<typeof vi.fn>;
    handleAuthorizationError: ReturnType<typeof vi.fn>;
    refreshToken: ReturnType<typeof vi.fn>;
  };
  let enrollmentsService: {
    syncInstagramAuthorizedSnapshot: ReturnType<typeof vi.fn>;
  };

  const credential = {
    accessToken: 'access-token',
    accessTokenExpiry: new Date('2026-08-13T08:00:00.000Z'),
    brandId: 'brand-1',
    externalId: 'ig-user-1',
    grantedScopes: fullScopes,
    id: 'credential-1',
    isConnected: true,
    isDeleted: false,
    organizationId: 'org-1',
    platform: CredentialPlatform.INSTAGRAM,
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
        if (url.includes('/media')) {
          return of({
            data: {
              data: [
                {
                  caption: 'First reel',
                  comments_count: 0,
                  id: 'media-1',
                  like_count: 0,
                  media_product_type: 'REELS',
                  media_type: 'VIDEO',
                  permalink: 'https://www.instagram.com/reel/media-1',
                  shortcode: 'media-1',
                  timestamp: '2026-08-10T12:00:00+0000',
                  insights: {
                    data: [
                      { name: 'impressions', values: [{ value: 40 }] },
                      { name: 'reach', values: [{ value: 30 }] },
                      { name: 'saved', values: [{ value: 2 }] },
                      { name: 'shares', values: [{ value: 1 }] },
                      {
                        name: 'total_interactions',
                        values: [{ value: 3 }],
                      },
                    ],
                  },
                },
              ],
              paging: {},
            },
          });
        }

        return of({
          data: {
            account_type: 'BUSINESS',
            biography: 'Niche creator',
            followers_count: 0,
            follows_count: 4,
            id: 'ig-user-1',
            media_count: 1,
            name: 'Creator',
            profile_picture_url: 'https://instagram.example/avatar.jpg',
            username: 'creator',
            website: 'https://example.com',
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
    instagramService = {
      getValidCredential: vi.fn().mockResolvedValue(credential),
      handleAuthorizationError: vi.fn().mockResolvedValue(false),
      refreshToken: vi.fn().mockResolvedValue(credential),
    };
    enrollmentsService = {
      syncInstagramAuthorizedSnapshot: vi.fn().mockResolvedValue(undefined),
    };

    service = new InstagramAuthorizedSignalsService(
      cacheService as unknown as CacheService,
      { get: vi.fn().mockReturnValue('v24.0') } as unknown as ConfigService,
      credentialsService as unknown as CredentialsService,
      httpService as unknown as HttpService,
      instagramService as unknown as InstagramService,
      { log: vi.fn(), warn: vi.fn() } as unknown as LoggerService,
      prisma as unknown as PrismaService,
      enrollmentsService as unknown as SocialWarmupEnrollmentsService,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('maps full authorized profile, owned media, publishing capability, insights, and Genfeed outcomes', async () => {
    const snapshot = await service.refresh({
      credentialId: credential.id,
      force: true,
      grantedScopes: fullScopes,
      organizationId: 'org-1',
    });

    expect(snapshot.state).toBe('full');
    expect(snapshot.grantedScopes).toEqual([...fullScopes].sort());
    expect(
      evidenceOf(snapshot, 'profile-fields-platform-signal'),
    ).toMatchObject({
      provenance: 'platform_verified',
      status: 'available',
      value: {
        accountType: 'BUSINESS',
        followersCount: 0,
        username: 'creator',
      },
    });
    expect(evidenceOf(snapshot, 'owned-media-snapshot')).toMatchObject({
      scope: {
        granted: [BASIC_SCOPE],
        missing: [],
        required: [BASIC_SCOPE],
      },
      value: { media: [{ id: 'media-1', likeCount: 0 }] },
    });
    expect(
      evidenceOf(snapshot, 'publishing-capability-snapshot'),
    ).toMatchObject({
      status: 'available',
      value: {
        accountType: 'BUSINESS',
        canPublish: true,
        isProfessionalAccount: true,
      },
    });
    expect(evidenceOf(snapshot, 'media-performance-snapshot')).toMatchObject({
      provenance: 'platform_verified',
      value: {
        media: [{ id: 'media-1', impressions: 40, saved: 2 }],
      },
    });
    expect(evidenceOf(snapshot, 'first-publish-platform-signal')).toMatchObject(
      {
        provenance: 'platform_verified',
        value: { media: { id: 'media-1' } },
      },
    );
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
      enrollmentsService.syncInstagramAuthorizedSnapshot,
    ).toHaveBeenCalledWith({
      brandId: 'brand-1',
      credentialId: credential.id,
      organizationId: 'org-1',
      snapshot,
    });
  });

  it('keeps missing scopes permission-limited without inventing zero values', async () => {
    const snapshot = await service.refresh({
      credentialId: credential.id,
      force: true,
      grantedScopes: [BASIC_SCOPE],
      organizationId: 'org-1',
    });

    expect(snapshot.state).toBe('partial');
    expect(
      evidenceOf(snapshot, 'profile-fields-platform-signal'),
    ).toMatchObject({
      status: 'available',
      value: { username: 'creator' },
    });
    expect(
      evidenceOf(snapshot, 'publishing-capability-snapshot'),
    ).toMatchObject({
      reason: 'missing_scope',
      scope: {
        granted: [],
        missing: [PUBLISH_SCOPE],
        required: [PUBLISH_SCOPE],
      },
      status: 'permission_limited',
    });
    expect(
      evidenceOf(snapshot, 'publishing-capability-snapshot'),
    ).not.toHaveProperty('value');
    expect(evidenceOf(snapshot, 'media-performance-snapshot')).toMatchObject({
      reason: 'missing_scope',
      status: 'permission_limited',
    });
    expect(httpService.get).toHaveBeenCalledWith(
      expect.stringContaining('/ig-user-1'),
      expect.objectContaining({
        params: expect.objectContaining({
          fields: expect.stringContaining('username'),
        }),
      }),
    );
  });

  it('does not call Instagram data endpoints when no data scopes were granted', async () => {
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

  it('treats a personal or creator-limited account as an actionable state, not a failed check', async () => {
    httpService.get.mockImplementation((url: string) => {
      if (url.includes('/media')) {
        return of({ data: { data: [], paging: {} } });
      }

      return of({
        data: {
          account_type: 'MEDIA_CREATOR',
          id: 'ig-user-1',
          username: 'creator',
        },
      });
    });

    const snapshot = await service.refresh({
      credentialId: credential.id,
      force: true,
      grantedScopes: fullScopes,
      organizationId: 'org-1',
    });

    expect(snapshot.state).toBe('partial');
    expect(
      evidenceOf(snapshot, 'publishing-capability-snapshot'),
    ).toMatchObject({
      reason: 'professional_account_limited',
      status: 'permission_limited',
      value: {
        accountType: 'MEDIA_CREATOR',
        canPublish: false,
        isProfessionalAccount: true,
      },
    });
    expect(evidenceOf(snapshot, 'profile-fields-platform-signal').status).toBe(
      'available',
    );
  });

  it('preserves the last successful values as revoked and stale-dated on token revocation', async () => {
    const previous = makePreviousSnapshot();
    credentialsService.findOne.mockResolvedValueOnce({
      ...credential,
      warmupSignals: { instagramAuthorized: previous },
    });
    httpService.get.mockReturnValue(
      throwError(() => providerError(190, 'Invalid OAuth access token', 401)),
    );
    instagramService.handleAuthorizationError.mockResolvedValueOnce(true);

    const snapshot = await service.refresh({
      credentialId: credential.id,
      force: true,
      grantedScopes: fullScopes,
      organizationId: 'org-1',
    });

    expect(snapshot.state).toBe('revoked');
    expect(
      evidenceOf(snapshot, 'profile-fields-platform-signal'),
    ).toMatchObject({
      observedAt: '2026-08-11T08:00:00.000Z',
      reason: 'authorization_revoked',
      staleAt: now.toISOString(),
      status: 'revoked',
      value: { username: 'creator' },
    });
    expect(instagramService.handleAuthorizationError).toHaveBeenCalledWith(
      credential.id,
      expect.anything(),
      expect.stringContaining('refresh'),
    );
  });

  it('returns the last successful snapshot as stale on provider errors', async () => {
    const previous = makePreviousSnapshot();
    credentialsService.findOne.mockResolvedValueOnce({
      ...credential,
      warmupSignals: { instagramAuthorized: previous },
    });
    httpService.get.mockReturnValue(
      throwError(() => providerError(1, 'An unknown error occurred', 500)),
    );

    const snapshot = await service.refresh({
      credentialId: credential.id,
      force: true,
      grantedScopes: fullScopes,
      organizationId: 'org-1',
    });

    expect(snapshot.state).toBe('stale');
    expect(evidenceOf(snapshot, 'owned-media-snapshot')).toMatchObject({
      reason: 'provider_error',
      staleAt: now.toISOString(),
      status: 'stale',
      value: { media: [{ id: 'media-1', likeCount: 12 }] },
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
      'profile-fields-platform-signal',
      'owned-media-snapshot',
      'publishing-capability-snapshot',
      'media-performance-snapshot',
      'first-publish-platform-signal',
      'genfeed-publish-outcomes-observed',
    ]);
    expect(JSON.stringify(snapshot)).not.toMatch(
      /watch history|explore page|likes made|saves made|comments made|accounts followed|direct messages|manual phone/i,
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
      enrollmentsService.syncInstagramAuthorizedSnapshot,
    ).not.toHaveBeenCalled();
  });

  it('persists snapshots by merging only the Instagram-owned warmup keys', async () => {
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
        instagramAuthorization: {
          grantedScopes: snapshot.grantedScopes,
          observedAt: snapshot.refreshAttemptedAt,
        },
        instagramAuthorized: snapshot,
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
      expect.stringContaining('/ig-user-1'),
      expect.objectContaining({
        params: expect.objectContaining({
          access_token: 'raw-oauth-token',
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
});
