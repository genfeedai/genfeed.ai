vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

import { SocialWarmupEnrollmentsService } from '@api/collections/social-warmup-enrollments/services/social-warmup-enrollments.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { instagramAuthorizedSignalsSnapshotSchema } from '@api-types/contracts/instagram-authorized-signals.contract';
import { linkedinAuthorizedSignalsSnapshotSchema } from '@api-types/contracts/linkedin-authorized-signals.contract';
import {
  INSTAGRAM_SOCIAL_WARMUP_BLUEPRINT_ID,
  TIKTOK_SOCIAL_WARMUP_BLUEPRINT_ID,
  TIKTOK_SOCIAL_WARMUP_BLUEPRINT_VERSION,
  TWITTER_SOCIAL_WARMUP_BLUEPRINT_ID,
  TWITTER_SOCIAL_WARMUP_BLUEPRINT_VERSION,
} from '@api-types/contracts/social-warmup-blueprint.contract';
import { SOCIAL_WARMUP_TELEMETRY_EVENT } from '@api-types/contracts/social-warmup-journey.contract';
import type { TwitterAuthorizedSignalsSnapshot } from '@api-types/contracts/twitter-authorized-signals.contract';
import { youtubeAuthorizedSignalsSnapshotSchema } from '@api-types/contracts/youtube-authorized-signals.contract';
import {
  CredentialPlatform,
  SocialWarmupEnrollmentState,
  SocialWarmupEventAction,
  SocialWarmupSignalSource,
  SocialWarmupSignalStatus,
} from '@genfeedai/enums';
import type { LoggerService } from '@libs/logger/logger.service';

const context = {
  brandId: 'brand-1',
  organizationId: 'org-1',
  userId: 'user-1',
};

function makeCredential(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    brandId: 'brand-1',
    id: 'credential-1',
    isConnected: true,
    isDeleted: false,
    organizationId: 'org-1',
    platform: CredentialPlatform.TIKTOK,
    warmupSignals: {},
    ...overrides,
  };
}

describe('SocialWarmupEnrollmentsService', () => {
  const socialWarmupEnrollment = {
    create: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    update: vi.fn(),
  };
  const socialWarmupEvent = {
    create: vi.fn(),
  };
  const socialWarmupSignal = {
    create: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  };
  const credential = {
    findFirst: vi.fn(),
    findMany: vi.fn(),
  };
  const prisma = {
    $transaction: vi.fn(async (operations: Promise<unknown>[]) =>
      Promise.all(operations),
    ),
    credential,
    socialWarmupEnrollment,
    socialWarmupEvent,
    socialWarmupSignal,
  };

  let service: SocialWarmupEnrollmentsService;

  beforeEach(() => {
    vi.clearAllMocks();
    credential.findFirst.mockResolvedValue(makeCredential());
    socialWarmupEnrollment.findFirst.mockResolvedValue(null);
    socialWarmupEnrollment.create.mockImplementation(async ({ data }) => ({
      ...data,
      createdAt: new Date('2026-08-11T00:00:00.000Z'),
      events: [],
      id: 'enrollment-1',
      isDeleted: false,
      signals: data.signals?.create ?? [],
      startedAt: data.startedAt,
      updatedAt: new Date('2026-08-11T00:00:00.000Z'),
    }));
    socialWarmupEnrollment.update.mockImplementation(async ({ data }) => ({
      blueprintId: TIKTOK_SOCIAL_WARMUP_BLUEPRINT_ID,
      blueprintVersion: TIKTOK_SOCIAL_WARMUP_BLUEPRINT_VERSION,
      brandId: 'brand-1',
      credentialId: 'credential-1',
      currentPhaseId: data.currentPhaseId,
      enrolledByUserId: 'user-1',
      events: [],
      id: 'enrollment-1',
      organizationId: 'org-1',
      signals: [],
      startedAt: new Date('2026-08-11T00:00:00.000Z'),
      state: data.state,
    }));
    service = new SocialWarmupEnrollmentsService(
      prisma as unknown as PrismaService,
    );
  });

  it('persists credential, pinned blueprint, start date, phase, state, and actor', async () => {
    const enrollment = await service.enrollScoped(
      { credentialId: 'credential-1' },
      context,
    );

    expect(socialWarmupEnrollment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          blueprintId: TIKTOK_SOCIAL_WARMUP_BLUEPRINT_ID,
          blueprintVersion: TIKTOK_SOCIAL_WARMUP_BLUEPRINT_VERSION,
          brandId: 'brand-1',
          credentialId: 'credential-1',
          enrolledByUserId: 'user-1',
          organizationId: 'org-1',
          state: SocialWarmupEnrollmentState.ENROLLED,
        }),
      }),
    );
    expect(enrollment.blueprintId).toBe(TIKTOK_SOCIAL_WARMUP_BLUEPRINT_ID);
    expect(enrollment.enrolledByUserId).toBe('user-1');
  });

  it('records enrollment telemetry without tokens or private activity', async () => {
    const log = vi.fn();
    const observed = new SocialWarmupEnrollmentsService(
      prisma as unknown as PrismaService,
      { log } as unknown as LoggerService,
    );

    await observed.enrollScoped({ credentialId: 'credential-1' }, context);

    expect(log).toHaveBeenCalledWith(
      SOCIAL_WARMUP_TELEMETRY_EVENT.enrolled,
      expect.objectContaining({
        credentialId: 'credential-1',
        organizationId: 'org-1',
        platform: CredentialPlatform.TIKTOK,
      }),
    );
    expect(JSON.stringify(log.mock.calls)).not.toMatch(
      /token|secret|password|authorization/i,
    );
  });

  it('returns the existing enrollment instead of creating a second row', async () => {
    socialWarmupEnrollment.findFirst.mockResolvedValue({
      blueprintId: TIKTOK_SOCIAL_WARMUP_BLUEPRINT_ID,
      blueprintVersion: TIKTOK_SOCIAL_WARMUP_BLUEPRINT_VERSION,
      brandId: 'brand-1',
      credentialId: 'credential-1',
      currentPhaseId: 'native-consumption-and-engagement',
      enrolledByUserId: 'user-1',
      events: [],
      id: 'enrollment-existing',
      organizationId: 'org-1',
      signals: [],
      startedAt: new Date('2026-08-01T00:00:00.000Z'),
      state: SocialWarmupEnrollmentState.IN_PROGRESS,
    });

    const enrollment = await service.enrollScoped(
      { credentialId: 'credential-1' },
      context,
    );

    expect(enrollment.id).toBe('enrollment-existing');
    expect(socialWarmupEnrollment.create).not.toHaveBeenCalled();
  });

  it('rejects a credential from another organization', async () => {
    credential.findFirst.mockResolvedValue(null);

    await expect(
      service.enrollScoped({ credentialId: 'credential-foreign' }, context),
    ).rejects.toThrow(
      "Credential with identifier 'credential-foreign' not found",
    );
  });

  it('keeps two credentials on the same brand independent', async () => {
    credential.findFirst
      .mockResolvedValueOnce(makeCredential({ id: 'credential-1' }))
      .mockResolvedValueOnce(makeCredential({ id: 'credential-2' }));

    await service.enrollScoped({ credentialId: 'credential-1' }, context);
    await service.enrollScoped({ credentialId: 'credential-2' }, context);

    expect(socialWarmupEnrollment.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({ credentialId: 'credential-1' }),
      }),
    );
    expect(socialWarmupEnrollment.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({ credentialId: 'credential-2' }),
      }),
    );
  });

  it('appends completed and reopened checklist events with provenance and actor', async () => {
    const enrollmentRow = {
      blueprintId: TIKTOK_SOCIAL_WARMUP_BLUEPRINT_ID,
      blueprintVersion: TIKTOK_SOCIAL_WARMUP_BLUEPRINT_VERSION,
      brandId: 'brand-1',
      credentialId: 'credential-1',
      currentPhaseId: 'native-consumption-and-engagement',
      enrolledByUserId: 'user-1',
      events: [],
      id: 'enrollment-1',
      organizationId: 'org-1',
      signals: [],
      startedAt: new Date('2026-08-11T00:00:00.000Z'),
      state: SocialWarmupEnrollmentState.ENROLLED,
    };
    socialWarmupEnrollment.findFirst.mockResolvedValue(enrollmentRow);
    socialWarmupEvent.create.mockResolvedValue({});

    await service.completeItemScoped(
      'enrollment-1',
      'watch-niche-content',
      {},
      context,
    );

    expect(socialWarmupEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: SocialWarmupEventAction.COMPLETED,
          actorUserId: 'user-1',
          itemId: 'watch-niche-content',
          organizationId: 'org-1',
          provenance: 'user_confirmed',
        }),
      }),
    );

    expect(socialWarmupEnrollment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          brandId: 'brand-1',
          id: 'enrollment-1',
          isDeleted: false,
          organizationId: 'org-1',
        }),
      }),
    );

    await service.reopenItemScoped(
      'enrollment-1',
      'watch-niche-content',
      {},
      context,
    );
    expect(socialWarmupEvent.create).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: SocialWarmupEventAction.REOPENED,
          itemId: 'watch-niche-content',
        }),
      }),
    );
  });

  it('preserves progress and marks platform signals stale on disconnect', async () => {
    credential.findFirst.mockResolvedValue(
      makeCredential({ isConnected: false }),
    );
    socialWarmupEnrollment.findFirst.mockResolvedValue({
      blueprintId: TIKTOK_SOCIAL_WARMUP_BLUEPRINT_ID,
      blueprintVersion: TIKTOK_SOCIAL_WARMUP_BLUEPRINT_VERSION,
      brandId: 'brand-1',
      credentialId: 'credential-1',
      currentPhaseId: 'native-consumption-and-engagement',
      enrolledByUserId: 'user-1',
      events: [
        {
          action: SocialWarmupEventAction.COMPLETED,
          itemId: 'watch-niche-content',
          occurredAt: new Date('2026-08-11T01:00:00.000Z'),
        },
      ],
      id: 'enrollment-1',
      organizationId: 'org-1',
      signals: [
        {
          id: 'signal-1',
          key: 'first-upload-platform-signal',
          source: SocialWarmupSignalSource.PLATFORM,
          status: SocialWarmupSignalStatus.AVAILABLE,
        },
      ],
      startedAt: new Date('2026-08-11T00:00:00.000Z'),
      state: SocialWarmupEnrollmentState.IN_PROGRESS,
    });

    const enrollment = await service.findOneScoped('enrollment-1', context);

    expect(enrollment.completedItemIds).toEqual(['watch-niche-content']);
    expect(enrollment.state).toBe(SocialWarmupEnrollmentState.DISCONNECTED);
    expect(enrollment.reconnect).toMatchObject({
      isAvailable: true,
      reason: 'disconnected',
    });
    expect(socialWarmupEnrollment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { state: SocialWarmupEnrollmentState.DISCONNECTED },
        where: expect.objectContaining({
          brandId: 'brand-1',
          id: 'enrollment-1',
          isDeleted: false,
          organizationId: 'org-1',
        }),
      }),
    );
    expect(socialWarmupSignal.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: SocialWarmupSignalStatus.STALE,
        }),
      }),
    );
  });

  it.each([
    {
      platform: CredentialPlatform.FACEBOOK,
      reason: /readiness-only/i,
    },
    {
      platform: CredentialPlatform.THREADS,
      reason: /readiness-only/i,
    },
    {
      platform: CredentialPlatform.SNAPCHAT,
      reason: /not supported/i,
    },
    {
      platform: CredentialPlatform.WORDPRESS,
      reason: /not supported/i,
    },
    {
      platform: CredentialPlatform.SHOPIFY,
      reason: /not supported/i,
    },
    {
      platform: CredentialPlatform.GOOGLE_ADS,
      reason: /not supported/i,
    },
  ])(
    'refuses to enroll $platform instead of inheriting a TikTok blueprint',
    async ({ platform, reason }) => {
      credential.findFirst.mockResolvedValue(makeCredential({ platform }));

      await expect(
        service.enrollScoped({ credentialId: 'credential-1' }, context),
      ).rejects.toThrow(reason);

      expect(socialWarmupEnrollment.create).not.toHaveBeenCalled();
    },
  );

  it('still enrolls Instagram and X on their own published blueprints', async () => {
    credential.findFirst.mockResolvedValue(
      makeCredential({ platform: CredentialPlatform.INSTAGRAM }),
    );

    await service.enrollScoped({ credentialId: 'credential-1' }, context);

    expect(socialWarmupEnrollment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          blueprintId: INSTAGRAM_SOCIAL_WARMUP_BLUEPRINT_ID,
        }),
      }),
    );
  });

  it('seeds enrollment signals from a stored X authorized snapshot', async () => {
    credential.findFirst.mockResolvedValue(
      makeCredential({
        platform: CredentialPlatform.TWITTER,
        warmupSignals: {
          twitterAuthorized: {
            evidence: [
              {
                fieldAvailability: { createdAt: 'available' },
                key: 'native-account-age',
                observedAt: '2026-08-14T08:00:00.000Z',
                provenance: 'platform_verified',
                status: 'available',
                value: { createdAt: '2018-01-01T00:00:00.000Z' },
              },
            ],
          },
        },
      }),
    );

    await service.enrollScoped({ credentialId: 'credential-1' }, context);

    expect(socialWarmupEnrollment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          blueprintId: TWITTER_SOCIAL_WARMUP_BLUEPRINT_ID,
          blueprintVersion: TWITTER_SOCIAL_WARMUP_BLUEPRINT_VERSION,
          signals: {
            create: [
              expect.objectContaining({
                key: 'native-account-age',
                source: SocialWarmupSignalSource.PLATFORM,
                status: SocialWarmupSignalStatus.AVAILABLE,
              }),
            ],
          },
        }),
      }),
    );
  });

  it('upserts enrollment signals from a refreshed X authorized snapshot', async () => {
    socialWarmupEnrollment.findFirst.mockResolvedValue({
      brandId: 'brand-1',
      credentialId: 'credential-1',
      id: 'enrollment-1',
      organizationId: 'org-1',
    });
    socialWarmupSignal.findFirst.mockResolvedValue(null);

    await service.syncTwitterAuthorizedSnapshot({
      brandId: 'brand-1',
      credentialId: 'credential-1',
      organizationId: 'org-1',
      snapshot: {
        credentialId: 'credential-1',
        evidence: [
          {
            fieldAvailability: { createdAt: 'available' },
            key: 'native-account-age',
            observedAt: '2026-08-14T08:00:00.000Z',
            provenance: 'platform_verified',
            scope: {
              granted: ['users.read'],
              missing: [],
              required: ['users.read'],
            },
            staleAt: null,
            status: 'available',
            value: { createdAt: '2018-01-01T00:00:00.000Z' },
          },
        ],
        grantedScopes: ['users.read'],
        platform: CredentialPlatform.TWITTER,
        refreshAttemptedAt: '2026-08-14T08:00:00.000Z',
        state: 'partial',
      } as TwitterAuthorizedSignalsSnapshot,
    });

    expect(socialWarmupSignal.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          key: 'native-account-age',
          organizationId: 'org-1',
          source: SocialWarmupSignalSource.PLATFORM,
          status: SocialWarmupSignalStatus.AVAILABLE,
        }),
      }),
    );
  });

  it('does not write enrollment signals when no X enrollment exists', async () => {
    socialWarmupEnrollment.findFirst.mockResolvedValue(null);

    await service.syncTwitterAuthorizedSnapshot({
      brandId: 'brand-1',
      credentialId: 'credential-1',
      organizationId: 'org-1',
      snapshot: {
        credentialId: 'credential-1',
        evidence: [],
        grantedScopes: [],
        platform: CredentialPlatform.TWITTER,
        refreshAttemptedAt: '2026-08-14T08:00:00.000Z',
        state: 'partial',
      } as unknown as TwitterAuthorizedSignalsSnapshot,
    });

    expect(socialWarmupSignal.create).not.toHaveBeenCalled();
    expect(socialWarmupSignal.update).not.toHaveBeenCalled();
  });

  it('upserts Instagram authorized snapshot evidence onto an existing enrollment', async () => {
    socialWarmupEnrollment.findFirst.mockResolvedValue({
      brandId: 'brand-1',
      id: 'enrollment-1',
      organizationId: 'org-1',
    });
    socialWarmupSignal.findFirst.mockResolvedValue(null);

    const snapshot = instagramAuthorizedSignalsSnapshotSchema.parse({
      credentialId: 'credential-1',
      evidence: [
        {
          fieldAvailability: { username: 'available' },
          key: 'profile-fields-platform-signal',
          observedAt: '2026-08-12T08:00:00.000Z',
          provenance: 'platform_verified',
          scope: {
            granted: ['instagram_basic'],
            missing: [],
            required: ['instagram_basic'],
          },
          staleAt: null,
          status: 'available',
          value: { username: 'creator' },
        },
        {
          fieldAvailability: { id: 'available' },
          key: 'owned-media-snapshot',
          observedAt: '2026-08-12T08:00:00.000Z',
          provenance: 'platform_verified',
          scope: {
            granted: ['instagram_basic'],
            missing: [],
            required: ['instagram_basic'],
          },
          staleAt: null,
          status: 'empty',
          value: { hasMore: false, media: [] },
        },
        {
          fieldAvailability: { canPublish: 'permission_limited' },
          key: 'publishing-capability-snapshot',
          observedAt: '2026-08-12T08:00:00.000Z',
          provenance: 'platform_verified',
          reason: 'missing_scope',
          scope: {
            granted: [],
            missing: ['instagram_content_publish'],
            required: ['instagram_content_publish'],
          },
          staleAt: null,
          status: 'permission_limited',
        },
        {
          fieldAvailability: { likeCount: 'permission_limited' },
          key: 'media-performance-snapshot',
          observedAt: '2026-08-12T08:00:00.000Z',
          provenance: 'platform_verified',
          reason: 'missing_scope',
          scope: {
            granted: [],
            missing: ['instagram_manage_insights'],
            required: ['instagram_manage_insights'],
          },
          staleAt: null,
          status: 'permission_limited',
        },
        {
          fieldAvailability: { id: 'available' },
          key: 'first-publish-platform-signal',
          observedAt: '2026-08-12T08:00:00.000Z',
          provenance: 'platform_verified',
          scope: {
            granted: ['instagram_basic'],
            missing: [],
            required: ['instagram_basic'],
          },
          staleAt: null,
          status: 'empty',
          value: {},
        },
        {
          fieldAvailability: { outcome: 'available' },
          key: 'genfeed-publish-outcomes-observed',
          observedAt: '2026-08-12T08:00:00.000Z',
          provenance: 'genfeed_observed',
          scope: { granted: [], missing: [], required: [] },
          staleAt: null,
          status: 'empty',
          value: { attempts: [] },
        },
      ],
      grantedScopes: ['instagram_basic'],
      platform: CredentialPlatform.INSTAGRAM,
      refreshAttemptedAt: '2026-08-12T08:00:00.000Z',
      state: 'partial',
    });

    await service.syncInstagramAuthorizedSnapshot({
      brandId: 'brand-1',
      credentialId: 'credential-1',
      organizationId: 'org-1',
      snapshot,
    });

    expect(socialWarmupSignal.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          key: 'profile-fields-platform-signal',
          organizationId: 'org-1',
          source: SocialWarmupSignalSource.PLATFORM,
          status: SocialWarmupSignalStatus.AVAILABLE,
        }),
      }),
    );
    expect(socialWarmupSignal.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          key: 'publishing-capability-snapshot',
          status: SocialWarmupSignalStatus.PERMISSION_LIMITED,
        }),
      }),
    );
    expect(socialWarmupSignal.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          key: 'genfeed-publish-outcomes-observed',
          source: SocialWarmupSignalSource.GENFEED,
        }),
      }),
    );
  });

  it('upserts YouTube authorized snapshot evidence onto an existing enrollment', async () => {
    socialWarmupEnrollment.findFirst.mockResolvedValue({
      brandId: 'brand-1',
      id: 'enrollment-1',
      organizationId: 'org-1',
    });
    socialWarmupSignal.findFirst.mockResolvedValue(null);

    const snapshot = youtubeAuthorizedSignalsSnapshotSchema.parse({
      credentialId: 'credential-1',
      evidence: [
        {
          fieldAvailability: { title: 'available' },
          key: 'channel-fields-platform-signal',
          observedAt: '2026-08-24T08:00:00.000Z',
          provenance: 'platform_verified',
          scope: {
            granted: ['https://www.googleapis.com/auth/youtube'],
            missing: [],
            required: ['https://www.googleapis.com/auth/youtube'],
          },
          staleAt: null,
          status: 'available',
          value: { title: 'Creator' },
        },
        {
          fieldAvailability: { id: 'available' },
          key: 'owned-uploads-snapshot',
          observedAt: '2026-08-24T08:00:00.000Z',
          provenance: 'platform_verified',
          scope: {
            granted: ['https://www.googleapis.com/auth/youtube'],
            missing: [],
            required: ['https://www.googleapis.com/auth/youtube'],
          },
          staleAt: null,
          status: 'empty',
          value: { hasMore: false, videos: [] },
        },
        {
          fieldAvailability: { canPublish: 'available' },
          key: 'publishing-capability-snapshot',
          observedAt: '2026-08-24T08:00:00.000Z',
          provenance: 'platform_verified',
          scope: {
            granted: ['https://www.googleapis.com/auth/youtube.upload'],
            missing: [],
            required: ['https://www.googleapis.com/auth/youtube.upload'],
          },
          staleAt: null,
          status: 'available',
          value: { canPublish: true },
        },
        {
          fieldAvailability: { views: 'permission_limited' },
          key: 'owned-video-analytics-snapshot',
          observedAt: '2026-08-24T08:00:00.000Z',
          provenance: 'platform_verified',
          reason: 'missing_scope',
          scope: {
            granted: [],
            missing: ['https://www.googleapis.com/auth/yt-analytics.readonly'],
            required: ['https://www.googleapis.com/auth/yt-analytics.readonly'],
          },
          staleAt: null,
          status: 'permission_limited',
        },
        {
          fieldAvailability: { id: 'available' },
          key: 'first-upload-platform-signal',
          observedAt: '2026-08-24T08:00:00.000Z',
          provenance: 'platform_verified',
          scope: {
            granted: ['https://www.googleapis.com/auth/youtube'],
            missing: [],
            required: ['https://www.googleapis.com/auth/youtube'],
          },
          staleAt: null,
          status: 'empty',
          value: {},
        },
        {
          fieldAvailability: { createdAt: 'available' },
          key: 'native-account-age',
          observedAt: '2026-08-24T08:00:00.000Z',
          provenance: 'platform_verified',
          scope: {
            granted: ['https://www.googleapis.com/auth/youtube'],
            missing: [],
            required: ['https://www.googleapis.com/auth/youtube'],
          },
          staleAt: null,
          status: 'available',
          value: { createdAt: '2026-01-01T00:00:00.000Z' },
        },
        {
          fieldAvailability: { outcome: 'available' },
          key: 'genfeed-publish-outcomes-observed',
          observedAt: '2026-08-24T08:00:00.000Z',
          provenance: 'genfeed_observed',
          scope: { granted: [], missing: [], required: [] },
          staleAt: null,
          status: 'empty',
          value: { attempts: [] },
        },
      ],
      grantedScopes: ['https://www.googleapis.com/auth/youtube'],
      platform: CredentialPlatform.YOUTUBE,
      refreshAttemptedAt: '2026-08-24T08:00:00.000Z',
      state: 'partial',
    });

    await service.syncYoutubeAuthorizedSnapshot({
      brandId: 'brand-1',
      credentialId: 'credential-1',
      organizationId: 'org-1',
      snapshot,
    });

    expect(socialWarmupSignal.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          key: 'channel-fields-platform-signal',
          organizationId: 'org-1',
          source: SocialWarmupSignalSource.PLATFORM,
          status: SocialWarmupSignalStatus.AVAILABLE,
        }),
      }),
    );
    expect(socialWarmupSignal.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          key: 'owned-video-analytics-snapshot',
          status: SocialWarmupSignalStatus.PERMISSION_LIMITED,
        }),
      }),
    );
    expect(socialWarmupSignal.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          key: 'genfeed-publish-outcomes-observed',
          source: SocialWarmupSignalSource.GENFEED,
        }),
      }),
    );
  });

  it('upserts LinkedIn authorized snapshot evidence onto an existing enrollment', async () => {
    socialWarmupEnrollment.findFirst.mockResolvedValue({
      brandId: 'brand-1',
      id: 'enrollment-1',
      organizationId: 'org-1',
    });
    socialWarmupSignal.findFirst.mockResolvedValue(null);

    const common = {
      fieldAvailability: { id: 'available' as const },
      observedAt: '2026-08-24T08:00:00.000Z',
      provenance: 'platform_verified' as const,
      staleAt: null,
      status: 'available' as const,
    };
    const snapshot = linkedinAuthorizedSignalsSnapshotSchema.parse({
      credentialId: 'credential-1',
      evidence: [
        {
          ...common,
          key: 'member-profile-fields-platform-signal',
          scope: {
            granted: ['openid', 'profile'],
            missing: [],
            required: ['openid', 'profile'],
          },
          value: { accountKind: 'member', id: 'member-1' },
        },
        {
          ...common,
          key: 'organization-page-snapshot',
          reason: 'missing_scope',
          scope: {
            granted: [],
            missing: ['r_organization_social'],
            required: ['r_organization_social'],
          },
          status: 'permission_limited',
        },
        {
          ...common,
          key: 'member-publishing-capability-snapshot',
          scope: {
            granted: ['w_member_social'],
            missing: [],
            required: ['w_member_social'],
          },
          value: { accountKind: 'member', canPublish: true },
        },
        {
          ...common,
          key: 'organization-publishing-capability-snapshot',
          reason: 'missing_scope',
          scope: {
            granted: [],
            missing: ['w_organization_social'],
            required: ['w_organization_social'],
          },
          status: 'permission_limited',
          value: { accountKind: 'organization', canPublish: false },
        },
        {
          ...common,
          key: 'owned-posts-snapshot',
          reason: 'missing_scope',
          scope: {
            granted: [],
            missing: ['r_member_social'],
            required: ['r_member_social'],
          },
          status: 'permission_limited',
        },
        {
          ...common,
          key: 'owned-post-performance-snapshot',
          reason: 'missing_scope',
          scope: {
            granted: [],
            missing: ['r_member_social'],
            required: ['r_member_social'],
          },
          status: 'permission_limited',
        },
        {
          ...common,
          key: 'first-publish-platform-signal',
          reason: 'missing_scope',
          scope: {
            granted: [],
            missing: ['r_member_social'],
            required: ['r_member_social'],
          },
          status: 'permission_limited',
        },
        {
          fieldAvailability: { outcome: 'available' },
          key: 'genfeed-publish-outcomes-observed',
          observedAt: '2026-08-24T08:00:00.000Z',
          provenance: 'genfeed_observed',
          scope: { granted: [], missing: [], required: [] },
          staleAt: null,
          status: 'empty',
          value: { attempts: [] },
        },
      ],
      grantedScopes: ['openid', 'profile', 'w_member_social'],
      platform: CredentialPlatform.LINKEDIN,
      refreshAttemptedAt: '2026-08-24T08:00:00.000Z',
      state: 'partial',
    });

    await service.syncLinkedinAuthorizedSnapshot({
      brandId: 'brand-1',
      credentialId: 'credential-1',
      organizationId: 'org-1',
      snapshot,
    });

    expect(socialWarmupSignal.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          key: 'member-profile-fields-platform-signal',
          organizationId: 'org-1',
          source: SocialWarmupSignalSource.PLATFORM,
          status: SocialWarmupSignalStatus.AVAILABLE,
        }),
      }),
    );
    expect(socialWarmupSignal.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          key: 'organization-publishing-capability-snapshot',
          status: SocialWarmupSignalStatus.PERMISSION_LIMITED,
        }),
      }),
    );
    expect(socialWarmupSignal.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          key: 'genfeed-publish-outcomes-observed',
          source: SocialWarmupSignalSource.GENFEED,
        }),
      }),
    );
  });
});
