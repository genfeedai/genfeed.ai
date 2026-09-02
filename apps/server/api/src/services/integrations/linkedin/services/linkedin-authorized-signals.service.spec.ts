vi.mock('@libs/utils/encryption/encryption.util', () => ({
  EncryptionUtil: {
    decrypt: vi.fn((value: string) => value),
  },
}));

import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { SocialWarmupEnrollmentsService } from '@api/collections/social-warmup-enrollments/services/social-warmup-enrollments.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { CacheService } from '@api/services/cache/cache.service';
import { LinkedInService } from '@api/services/integrations/linkedin/services/linkedin.service';
import { LinkedInAuthorizedSignalsService } from '@api/services/integrations/linkedin/services/linkedin-authorized-signals.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { CredentialPlatform, TargetExecutionState } from '@genfeedai/contracts';
import {
  type LinkedinAuthorizedSignalEvidence,
  type LinkedinAuthorizedSignalsSnapshot,
  linkedinAuthorizedSignalsSnapshotSchema,
} from '@genfeedai/contracts/api-types/contracts/linkedin-authorized-signals.contract';
import { LoggerService } from '@libs/logger/logger.service';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';

const now = new Date('2026-08-24T08:00:00.000Z');
const MEMBER_SCOPES = ['openid', 'profile', 'email', 'w_member_social'];
const FULL_SCOPES = [
  ...MEMBER_SCOPES,
  'r_member_social',
  'r_organization_social',
  'w_organization_social',
];

function providerError(status: number, message = 'error') {
  return {
    response: {
      data: { message, status },
      headers: {},
      status,
    },
  };
}

function evidenceOf(
  snapshot: LinkedinAuthorizedSignalsSnapshot,
  key: LinkedinAuthorizedSignalEvidence['key'],
) {
  const evidence = snapshot.evidence.find((item) => item.key === key);
  if (!evidence) {
    throw new Error(`Missing evidence ${key}`);
  }
  return evidence;
}

function makePreviousSnapshot(): LinkedinAuthorizedSignalsSnapshot {
  const scope = {
    granted: MEMBER_SCOPES,
    missing: [],
    required: ['openid', 'profile'],
  };
  const common = {
    fieldAvailability: { id: 'available' as const },
    observedAt: '2026-08-23T08:00:00.000Z',
    provenance: 'platform_verified' as const,
    scope,
    staleAt: null,
    status: 'available' as const,
  };

  return linkedinAuthorizedSignalsSnapshotSchema.parse({
    credentialId: 'credential-1',
    evidence: [
      {
        ...common,
        key: 'member-profile-fields-platform-signal',
        value: { accountKind: 'member', id: 'member-1', name: 'Ada Lovelace' },
      },
      {
        ...common,
        key: 'organization-page-snapshot',
        reason: 'missing_scope',
        status: 'permission_limited',
      },
      {
        ...common,
        key: 'member-publishing-capability-snapshot',
        value: { accountKind: 'member', canPublish: true },
      },
      {
        ...common,
        key: 'organization-publishing-capability-snapshot',
        reason: 'missing_scope',
        status: 'permission_limited',
        value: { accountKind: 'organization', canPublish: false },
      },
      {
        ...common,
        key: 'owned-posts-snapshot',
        value: { hasMore: false, posts: [{ id: 'urn:li:ugcPost:1' }] },
      },
      {
        ...common,
        key: 'owned-post-performance-snapshot',
        value: { posts: [{ id: 'urn:li:ugcPost:1', likeCount: 4 }] },
      },
      {
        ...common,
        key: 'first-publish-platform-signal',
        value: { post: { id: 'urn:li:ugcPost:1' } },
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
    grantedScopes: MEMBER_SCOPES,
    platform: CredentialPlatform.LINKEDIN,
    refreshAttemptedAt: '2026-08-23T08:00:00.000Z',
    state: 'partial',
  });
}

describe('LinkedInAuthorizedSignalsService', () => {
  let service: LinkedInAuthorizedSignalsService;
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
  let linkedInService: {
    getUserProfile: ReturnType<typeof vi.fn>;
    refreshToken: ReturnType<typeof vi.fn>;
  };
  let enrollmentsService: {
    syncLinkedinAuthorizedSnapshot: ReturnType<typeof vi.fn>;
  };

  const credential = {
    accessToken: 'access-token',
    accessTokenExpiry: new Date('2026-08-25T08:00:00.000Z'),
    brandId: 'brand-1',
    externalId: 'member-1',
    grantedScopes: MEMBER_SCOPES,
    id: 'credential-1',
    isConnected: true,
    isDeleted: false,
    organizationId: 'org-1',
    platform: CredentialPlatform.LINKEDIN,
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
        if (url.includes('/ugcPosts')) {
          return of({
            data: {
              elements: [
                {
                  author: 'urn:li:person:member-1',
                  created: { time: Date.parse('2026-08-20T12:00:00.000Z') },
                  id: 'urn:li:ugcPost:1',
                  specificContent: {
                    'com.linkedin.ugc.ShareContent': {
                      shareCommentary: { text: 'A value-led observation.' },
                      shareMediaCategory: 'NONE',
                    },
                  },
                },
              ],
              paging: { total: 1 },
            },
          });
        }
        if (url.includes('/organizationAcls')) {
          return of({
            data: {
              elements: [
                {
                  organization: 'urn:li:organization:99',
                  role: 'ADMINISTRATOR',
                  state: 'APPROVED',
                },
              ],
            },
          });
        }
        if (url.includes('/organizations/')) {
          return of({
            data: {
              id: 99,
              localizedName: 'Acme',
              vanityName: 'acme',
            },
          });
        }
        if (url.includes('/socialActions/')) {
          return of({
            data: {
              commentCount: 2,
              likeCount: 7,
              viewCount: 40,
            },
          });
        }
        return throwError(() => providerError(404, 'unexpected url'));
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
    linkedInService = {
      getUserProfile: vi.fn().mockResolvedValue({
        email: 'ada@example.com',
        firstName: 'Ada',
        id: 'member-1',
        lastName: 'Lovelace',
        picture: 'https://linkedin.example/ada.jpg',
      }),
      refreshToken: vi.fn().mockResolvedValue(credential),
    };
    enrollmentsService = {
      syncLinkedinAuthorizedSnapshot: vi.fn().mockResolvedValue(undefined),
    };

    service = new LinkedInAuthorizedSignalsService(
      cacheService as unknown as CacheService,
      credentialsService as unknown as CredentialsService,
      httpService as unknown as HttpService,
      linkedInService as unknown as LinkedInService,
      { log: vi.fn(), warn: vi.fn() } as unknown as LoggerService,
      prisma as unknown as PrismaService,
      enrollmentsService as unknown as SocialWarmupEnrollmentsService,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('maps member profile and publishing without claiming organization-page readiness', async () => {
    const snapshot = await service.refresh({
      credentialId: 'credential-1',
      organizationId: 'org-1',
    });

    expect(snapshot.state).toBe('partial');
    expect(
      evidenceOf(snapshot, 'member-profile-fields-platform-signal'),
    ).toMatchObject({
      provenance: 'platform_verified',
      status: 'available',
      value: { accountKind: 'member', id: 'member-1', name: 'Ada Lovelace' },
    });
    expect(
      evidenceOf(snapshot, 'member-publishing-capability-snapshot'),
    ).toMatchObject({
      status: 'available',
      value: { accountKind: 'member', canPublish: true },
    });
    expect(evidenceOf(snapshot, 'organization-page-snapshot')).toMatchObject({
      reason: 'missing_scope',
      status: 'permission_limited',
    });
    expect(
      evidenceOf(snapshot, 'organization-publishing-capability-snapshot'),
    ).toMatchObject({
      reason: 'missing_scope',
      status: 'permission_limited',
    });
    expect(evidenceOf(snapshot, 'owned-posts-snapshot')).toMatchObject({
      reason: 'missing_scope',
      status: 'permission_limited',
    });
    expect(
      evidenceOf(snapshot, 'genfeed-publish-outcomes-observed'),
    ).toMatchObject({
      provenance: 'genfeed_observed',
      status: 'available',
      value: { attempts: [{ outcome: 'failed', postId: 'post-1' }] },
    });
    expect(httpService.get).not.toHaveBeenCalled();
    expect(snapshot.evidence.map((item) => item.key)).not.toEqual(
      expect.arrayContaining(['ssi-score', 'connection-requests', 'comments']),
    );
  });

  it('keeps organization publishing as a separate claim when organization scopes are granted', async () => {
    credentialsService.findOne.mockResolvedValue({
      ...credential,
      grantedScopes: FULL_SCOPES,
    });

    const snapshot = await service.refresh({
      credentialId: 'credential-1',
      grantedScopes: FULL_SCOPES,
      organizationId: 'org-1',
    });

    expect(evidenceOf(snapshot, 'organization-page-snapshot')).toMatchObject({
      status: 'available',
      value: {
        accountKind: 'organization',
        id: '99',
        name: 'Acme',
      },
    });
    expect(
      evidenceOf(snapshot, 'organization-publishing-capability-snapshot'),
    ).toMatchObject({
      status: 'available',
      value: {
        accountKind: 'organization',
        canPublish: true,
        organizationId: '99',
      },
    });
    expect(evidenceOf(snapshot, 'owned-posts-snapshot')).toMatchObject({
      status: 'available',
      value: {
        posts: [expect.objectContaining({ id: 'urn:li:ugcPost:1' })],
      },
    });
    expect(
      evidenceOf(snapshot, 'member-publishing-capability-snapshot').value,
    ).not.toEqual(
      evidenceOf(snapshot, 'organization-publishing-capability-snapshot').value,
    );
  });

  it('treats a missing organization page as selection-required, not member-ready', async () => {
    credentialsService.findOne.mockResolvedValue({
      ...credential,
      grantedScopes: [
        ...MEMBER_SCOPES,
        'w_organization_social',
        'r_organization_social',
      ],
    });
    httpService.get.mockImplementation((url: string) => {
      if (url.includes('/organizationAcls')) {
        return of({ data: { elements: [] } });
      }
      return throwError(() => providerError(404, 'unexpected url'));
    });

    const snapshot = await service.refresh({
      credentialId: 'credential-1',
      grantedScopes: [
        ...MEMBER_SCOPES,
        'w_organization_social',
        'r_organization_social',
      ],
      organizationId: 'org-1',
    });

    expect(evidenceOf(snapshot, 'organization-page-snapshot')).toMatchObject({
      reason: 'organization_page_selection_required',
      status: 'permission_limited',
    });
    expect(
      evidenceOf(snapshot, 'organization-publishing-capability-snapshot'),
    ).toMatchObject({
      reason: 'organization_page_selection_required',
      status: 'permission_limited',
    });
    expect(
      evidenceOf(snapshot, 'member-publishing-capability-snapshot'),
    ).toMatchObject({
      status: 'available',
      value: { canPublish: true },
    });
  });

  it('preserves the last successful values as revoked and stale-dated on token revocation', async () => {
    credentialsService.findOne.mockResolvedValue({
      ...credential,
      isConnected: false,
      warmupSignals: { linkedinAuthorized: makePreviousSnapshot() },
    });

    const snapshot = await service.refresh({
      credentialId: 'credential-1',
      organizationId: 'org-1',
    });

    expect(snapshot.state).toBe('revoked');
    expect(
      evidenceOf(snapshot, 'member-profile-fields-platform-signal'),
    ).toMatchObject({
      reason: 'authorization_revoked',
      status: 'revoked',
      staleAt: now.toISOString(),
      value: { id: 'member-1' },
    });
    expect(linkedInService.getUserProfile).not.toHaveBeenCalled();
  });

  it('returns the last successful snapshot as stale on provider errors', async () => {
    credentialsService.findOne.mockResolvedValue({
      ...credential,
      warmupSignals: { linkedinAuthorized: makePreviousSnapshot() },
    });
    linkedInService.getUserProfile.mockRejectedValue(
      providerError(500, 'LinkedIn is unavailable'),
    );

    const snapshot = await service.refresh({
      credentialId: 'credential-1',
      force: true,
      organizationId: 'org-1',
    });

    expect(
      evidenceOf(snapshot, 'member-profile-fields-platform-signal'),
    ).toMatchObject({
      reason: 'provider_error',
      status: 'stale',
      value: { id: 'member-1' },
    });
  });

  it('serves a fresh cached snapshot without issuing provider or database requests', async () => {
    const cached = makePreviousSnapshot();
    cacheService.get.mockResolvedValue(cached);

    const snapshot = await service.refresh({
      credentialId: 'credential-1',
      organizationId: 'org-1',
    });

    expect(snapshot).toEqual(cached);
    expect(linkedInService.getUserProfile).not.toHaveBeenCalled();
    expect(prisma.post.findMany).not.toHaveBeenCalled();
  });

  it('throws the canonical 404 for a missing or cross-organization credential', async () => {
    credentialsService.findOne.mockResolvedValue(null);

    await expect(
      service.refresh({
        credentialId: 'missing',
        organizationId: 'org-1',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('uses a raw OAuth exchange token verbatim without decrypting it', async () => {
    await service.refresh({
      accessToken: 'plaintext-token',
      credentialId: 'credential-1',
      force: true,
      organizationId: 'org-1',
    });

    expect(linkedInService.getUserProfile).toHaveBeenCalledWith(
      'plaintext-token',
    );
    expect(EncryptionUtil.decrypt).not.toHaveBeenCalled();
  });

  it('decrypts only the persisted credential token when none is provided', async () => {
    await service.refresh({
      credentialId: 'credential-1',
      force: true,
      organizationId: 'org-1',
    });

    expect(EncryptionUtil.decrypt).toHaveBeenCalledWith('access-token');
    expect(linkedInService.getUserProfile).toHaveBeenCalledWith('access-token');
  });

  it('persists snapshots by merging only the LinkedIn-owned warmup keys', async () => {
    await service.refresh({
      credentialId: 'credential-1',
      organizationId: 'org-1',
    });

    expect(credentialsService.mergeWarmupSignals).toHaveBeenCalledWith(
      'credential-1',
      'org-1',
      expect.objectContaining({
        linkedinAuthorization: expect.objectContaining({
          grantedScopes: expect.arrayContaining(MEMBER_SCOPES),
        }),
        linkedinAuthorized: expect.objectContaining({
          platform: CredentialPlatform.LINKEDIN,
        }),
      }),
    );
    expect(
      enrollmentsService.syncLinkedinAuthorizedSnapshot,
    ).toHaveBeenCalled();
  });
});
