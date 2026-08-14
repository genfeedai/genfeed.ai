vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

import { SocialWarmupEnrollmentsService } from '@api/collections/social-warmup-enrollments/services/social-warmup-enrollments.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { instagramAuthorizedSignalsSnapshotSchema } from '@api-types/contracts/instagram-authorized-signals.contract';
import {
  TIKTOK_SOCIAL_WARMUP_BLUEPRINT_ID,
  TIKTOK_SOCIAL_WARMUP_BLUEPRINT_VERSION,
  TWITTER_SOCIAL_WARMUP_BLUEPRINT_ID,
  TWITTER_SOCIAL_WARMUP_BLUEPRINT_VERSION,
} from '@api-types/contracts/social-warmup-blueprint.contract';
import type { TwitterAuthorizedSignalsSnapshot } from '@api-types/contracts/twitter-authorized-signals.contract';
import {
  CredentialPlatform,
  SocialWarmupEnrollmentState,
  SocialWarmupEventAction,
  SocialWarmupSignalSource,
  SocialWarmupSignalStatus,
} from '@genfeedai/enums';

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
});
