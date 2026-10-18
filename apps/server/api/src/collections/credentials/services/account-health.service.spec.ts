import { AccountHealthService } from '@api/collections/credentials/services/account-health.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  CredentialPlatform,
  SocialWarmupEventAction,
  TargetExecutionState,
} from '@genfeedai/contracts';
import { postExecutionStateReadFilter } from '@genfeedai/contracts/api-types/contracts/scheduler.contract';
import {
  TIKTOK_SOCIAL_WARMUP_BLUEPRINT_ID,
  TIKTOK_SOCIAL_WARMUP_BLUEPRINT_VERSION,
} from '@genfeedai/contracts/api-types/contracts/social-warmup-blueprint.contract';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const now = new Date('2026-06-30T10:00:00.000Z');

function makeCredential(overrides: Record<string, unknown> = {}) {
  return {
    brandId: 'brand-1',
    createdAt: new Date('2026-06-30T09:00:00.000Z'),
    externalAvatar: null,
    externalHandle: '@fresh',
    externalName: null,
    id: 'credential-1',
    isConnected: true,
    isDeleted: false,
    label: null,
    organizationId: 'org-1',
    platform: CredentialPlatform.TIKTOK,
    warmupAssessedAt: null,
    warmupHoldReason: null,
    warmupManualOverride: false,
    warmupOverrideConfirmedAt: null,
    warmupOverrideConfirmedByUserId: null,
    warmupOverrideReason: null,
    warmupOverrideUntil: null,
    warmupRiskLevel: 'unknown',
    warmupScore: 0,
    warmupSignals: {},
    warmupState: 'not_started',
    warmupThresholds: {},
    ...overrides,
  };
}

describe('AccountHealthService', () => {
  let service: AccountHealthService;
  let prisma: {
    $executeRaw: ReturnType<typeof vi.fn>;
    credential: {
      findFirst: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    post: {
      count: ReturnType<typeof vi.fn>;
      groupBy: ReturnType<typeof vi.fn>;
    };
    socialWarmupEnrollment: {
      findFirst: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);

    prisma = {
      $executeRaw: vi.fn().mockResolvedValue(1),
      credential: {
        findFirst: vi.fn().mockResolvedValue(makeCredential()),
        findMany: vi.fn().mockResolvedValue([]),
        update: vi.fn().mockResolvedValue(makeCredential()),
      },
      post: {
        count: vi.fn().mockResolvedValue(0),
        groupBy: vi.fn().mockResolvedValue([]),
      },
      socialWarmupEnrollment: {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
      },
    };

    service = new AccountHealthService(prisma as unknown as PrismaService);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('listBrandHealth', () => {
    it('matches single-account assessments using four scoped shared reads', async () => {
      const credentials = [
        makeCredential({
          id: 'credential-2',
          platform: 'TWITTER',
          warmupManualOverride: true,
          warmupOverrideReason: 'operator checked',
          warmupOverrideUntil: new Date('2026-07-01T10:00:00.000Z'),
          warmupThresholds: { minConnectedDays: 15, minPublishedPosts: 5 },
        }),
        makeCredential(),
      ];
      const enrollments = credentials.map((credential, index) => ({
        blueprintId: TIKTOK_SOCIAL_WARMUP_BLUEPRINT_ID,
        blueprintVersion: TIKTOK_SOCIAL_WARMUP_BLUEPRINT_VERSION,
        credentialId: credential.id,
        events: [
          {
            action: SocialWarmupEventAction.COMPLETED,
            itemId: 'use-native-app-manually',
            occurredAt: now,
          },
        ],
        signals: [
          {
            evidence: {
              video: {
                createTime:
                  Math.floor(now.getTime() / 1000) -
                  (index + 1) * 10 * 24 * 60 * 60,
              },
            },
            key: 'first-upload-platform-signal',
            source: 'PLATFORM',
            status: 'AVAILABLE',
          },
        ],
        startedAt: now,
        state: 'ENROLLED',
      }));
      prisma.credential.findFirst
        .mockResolvedValueOnce(credentials[0])
        .mockResolvedValueOnce(credentials[1]);
      prisma.post.count
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(7)
        .mockResolvedValueOnce(0);
      prisma.socialWarmupEnrollment.findFirst
        .mockResolvedValueOnce(enrollments[0])
        .mockResolvedValueOnce(enrollments[1]);
      const expected = [];
      for (const credential of credentials) {
        expected.push(
          await service.assessCredentialHealth({
            brandId: 'brand-1',
            credentialId: credential.id,
            organizationId: 'org-1',
          }),
        );
      }
      vi.clearAllMocks();
      prisma.credential.findMany.mockResolvedValueOnce(credentials);
      prisma.post.groupBy
        .mockResolvedValueOnce([
          { _count: { _all: 7 }, credentialId: 'credential-1' },
          { _count: { _all: 2 }, credentialId: 'credential-2' },
        ])
        .mockResolvedValueOnce([
          { _count: { _all: 1 }, credentialId: 'credential-2' },
        ]);
      prisma.socialWarmupEnrollment.findMany.mockResolvedValueOnce(
        [...enrollments].reverse(),
      );

      const summaries = await service.listBrandHealth('org-1', 'brand-1');

      expect(summaries).toEqual(expected);
      expect(summaries[0].override.isActive).toBe(true);
      expect(summaries[1].signals.accountAgeDays).toBe(20);
      expect(summaries[1].holdReason).not.toContain('Use TikTok manually');
      expect(prisma.credential.findMany).toHaveBeenCalledExactlyOnceWith({
        orderBy: { createdAt: 'asc' },
        where: {
          brandId: 'brand-1',
          isConnected: true,
          isDeleted: false,
          organizationId: 'org-1',
        },
      });
      const scope = {
        credentialId: { in: ['credential-2', 'credential-1'] },
        isDeleted: false,
        organizationId: 'org-1',
      };
      expect(prisma.post.groupBy).toHaveBeenCalledTimes(2);
      expect(prisma.post.groupBy).toHaveBeenNthCalledWith(1, {
        _count: { _all: true },
        by: ['credentialId'],
        where: {
          ...scope,
          ...postExecutionStateReadFilter(TargetExecutionState.PUBLISHED),
        },
      });
      expect(prisma.post.groupBy).toHaveBeenNthCalledWith(2, {
        _count: { _all: true },
        by: ['credentialId'],
        where: {
          ...scope,
          createdAt: { gte: new Date('2026-05-31T10:00:00.000Z') },
          ...postExecutionStateReadFilter(TargetExecutionState.FAILED),
        },
      });
      expect(
        prisma.socialWarmupEnrollment.findMany,
      ).toHaveBeenCalledExactlyOnceWith({
        include: {
          events: {
            where: {
              brandId: 'brand-1',
              isDeleted: false,
              organizationId: 'org-1',
            },
          },
          signals: {
            where: {
              brandId: 'brand-1',
              isDeleted: false,
              organizationId: 'org-1',
            },
          },
        },
        where: { ...scope, brandId: 'brand-1' },
      });
      expect(prisma.credential.findFirst).not.toHaveBeenCalled();
      expect(prisma.post.count).not.toHaveBeenCalled();
      expect(prisma.socialWarmupEnrollment.findFirst).not.toHaveBeenCalled();
      expect(prisma.$executeRaw).toHaveBeenCalledTimes(2);
      for (const [query, ...values] of prisma.$executeRaw.mock.calls) {
        expect(query.join('$')).toContain(
          `COALESCE("warmupSignals", '{}'::jsonb) ||`,
        );
        expect(query.join('$')).toContain('"isDeleted" = false');
        expect(values).toContain('org-1');
      }
    });

    it('uses zero counts and missing evidence when an account has no groups', async () => {
      prisma.credential.findMany.mockResolvedValueOnce([makeCredential()]);

      const summaries = await service.listBrandHealth('org-1', 'brand-1');

      expect(summaries).toHaveLength(1);
      expect(summaries[0].signals).toMatchObject({
        accountAgeDays: null,
        accountAgeStatus: 'MISSING',
        publishedPosts: 0,
        recentFailures: 0,
      });
      expect(summaries[0].holdPublishing).toBe(true);
      expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    });

    it('skips shared evidence reads and writes when there are no accounts', async () => {
      await expect(
        service.listBrandHealth('org-1', 'brand-1'),
      ).resolves.toEqual([]);

      expect(prisma.credential.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.credential.findFirst).not.toHaveBeenCalled();
      expect(prisma.post.groupBy).not.toHaveBeenCalled();
      expect(prisma.post.count).not.toHaveBeenCalled();
      expect(prisma.socialWarmupEnrollment.findMany).not.toHaveBeenCalled();
      expect(prisma.socialWarmupEnrollment.findFirst).not.toHaveBeenCalled();
      expect(prisma.$executeRaw).not.toHaveBeenCalled();
    });

    it('limits concurrent health evidence writes while retaining account order', async () => {
      const credentials = Array.from({ length: 9 }, (_, index) =>
        makeCredential({ id: `credential-${index + 1}` }),
      );
      prisma.credential.findMany.mockResolvedValueOnce(credentials);
      let active = 0;
      let peak = 0;
      const release: Array<() => void> = [];
      prisma.$executeRaw.mockImplementation(
        () =>
          new Promise<number>((resolve) => {
            active += 1;
            peak = Math.max(peak, active);
            release.push(() => {
              active -= 1;
              resolve(1);
            });
          }),
      );

      const pending = service.listBrandHealth('org-1', 'brand-1');
      let completed = 0;
      while (completed < credentials.length) {
        await vi.waitFor(() => expect(release.length).toBeGreaterThan(0));
        for (const finish of release.splice(0)) {
          finish();
          completed += 1;
        }
      }
      const summaries = await pending;

      expect(peak).toBeLessThanOrEqual(4);
      expect(summaries.map((summary) => summary.credentialId)).toEqual(
        credentials.map((credential) => credential.id),
      );
      expect(prisma.$executeRaw).toHaveBeenCalledTimes(credentials.length);
    });
  });

  it('applies warmup scoring for a Prisma SCREAMING twitter credential', async () => {
    prisma.credential.findFirst.mockResolvedValue(
      makeCredential({ platform: 'TWITTER' }),
    );

    const summary = await service.assessCredentialHealth({
      brandId: 'brand-1',
      credentialId: 'credential-1',
      organizationId: 'org-1',
    });

    expect(summary.platform).toBe(CredentialPlatform.TWITTER);
    expect(summary.holdPublishing).toBe(true);
    expect(summary.state).toBe('not_started');
    expect(prisma.$executeRaw.mock.calls[0]).toEqual(
      expect.arrayContaining([
        expect.stringContaining('twitter publishing is held'),
      ]),
    );
  });

  it('holds scheduled publishing for a not-started warmup account', async () => {
    const gate = await service.evaluateScheduledPublishGate({
      brandId: 'brand-1',
      credentialId: 'credential-1',
      organizationId: 'org-1',
    });

    expect(gate.holdPublishing).toBe(true);
    expect(gate.summary.state).toBe('not_started');
    expect(gate.summary.riskLevel).toBe('high');
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    expect(prisma.$executeRaw.mock.calls[0]).toEqual(
      expect.arrayContaining([
        expect.stringContaining('tiktok publishing is held'),
        'not_started',
        'credential-1',
        'org-1',
      ]),
    );
  });

  it('uses assessment threshold overrides for platform scoring', async () => {
    const summary = await service.assessCredentialHealth({
      brandId: 'brand-1',
      credentialId: 'credential-1',
      organizationId: 'org-1',
      request: {
        signals: {
          connectedDays: 2,
          profileSignals: 2,
          publishedPosts: 1,
          recentFailures: 0,
        },
        thresholds: {
          minConnectedDays: 1,
          minPublishedPosts: 1,
        },
      },
    });

    expect(summary.state).toBe('healthy');
    expect(summary.holdPublishing).toBe(false);
    expect(summary.thresholds.minConnectedDays).toBe(1);
    expect(summary.thresholds.minPublishedPosts).toBe(1);
  });

  it('requires and applies explicit manual overrides', async () => {
    await expect(
      service.confirmManualOverride({
        credentialId: 'credential-1',
        organizationId: 'org-1',
        request: {
          confirm: false as true,
          reason: 'operator checked',
        },
        userId: 'user-1',
      }),
    ).rejects.toThrow('explicit confirmation');

    prisma.credential.findFirst
      .mockResolvedValueOnce(makeCredential())
      .mockResolvedValueOnce(
        makeCredential({
          warmupManualOverride: true,
          warmupOverrideConfirmedAt: now,
          warmupOverrideConfirmedByUserId: 'user-1',
          warmupOverrideReason: 'operator checked',
          warmupOverrideUntil: new Date('2026-07-01T10:00:00.000Z'),
        }),
      );

    const summary = await service.confirmManualOverride({
      credentialId: 'credential-1',
      organizationId: 'org-1',
      request: {
        confirm: true,
        expiresAt: '2026-07-01T10:00:00.000Z',
        reason: 'operator checked',
      },
      userId: 'user-1',
    });

    expect(summary.override.isActive).toBe(true);
    expect(summary.holdPublishing).toBe(false);
    expect(prisma.credential.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          warmupManualOverride: true,
          warmupOverrideConfirmedByUserId: 'user-1',
        }),
      }),
    );
  });

  it('counts published and failed posts as account health signals', async () => {
    prisma.post.count.mockResolvedValueOnce(3).mockResolvedValueOnce(1);

    const summary = await service.assessCredentialHealth({
      brandId: 'brand-1',
      credentialId: 'credential-1',
      organizationId: 'org-1',
    });

    expect(prisma.post.count).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          credentialId: 'credential-1',
          ...postExecutionStateReadFilter(TargetExecutionState.PUBLISHED),
        }),
      }),
    );
    expect(summary.signals.publishedPosts).toBe(3);
    expect(summary.signals.recentFailures).toBe(1);
    expect(summary.state).toBe('risky');
  });

  it('merges health signals atomically without replacing concurrent provider evidence', async () => {
    prisma.credential.findFirst.mockResolvedValueOnce(
      makeCredential({
        warmupSignals: {
          tiktokAuthorized: { state: 'partial' },
        },
      }),
    );

    await service.assessCredentialHealth({
      credentialId: 'credential-1',
      organizationId: 'org-1',
    });

    // The write must be an in-database jsonb merge scoped to health keys —
    // never a full-object replacement built from the stale credential read —
    // so a snapshot persisted between the read and this write survives.
    expect(prisma.credential.update).not.toHaveBeenCalled();
    const [query, ...values] = prisma.$executeRaw.mock.calls[0] as [
      TemplateStringsArray,
      ...unknown[],
    ];
    expect(query.join('$')).toContain(
      `COALESCE("warmupSignals", '{}'::jsonb) ||`,
    );
    const signalsJson = values.find(
      (value) => typeof value === 'string' && value.includes('connectedDays'),
    ) as string;
    expect(JSON.parse(signalsJson)).toEqual({
      accountAgeDays: null,
      accountAgeStatus: 'MISSING',
      connectedDays: expect.any(Number),
      profileSignals: expect.any(Number),
      publishedPosts: expect.any(Number),
      recentFailures: expect.any(Number),
    });
    expect(signalsJson).not.toContain('tiktokAuthorized');
  });

  it('holds publishing for incomplete required checks and names them', async () => {
    prisma.socialWarmupEnrollment.findFirst.mockResolvedValueOnce({
      blueprintId: TIKTOK_SOCIAL_WARMUP_BLUEPRINT_ID,
      blueprintVersion: TIKTOK_SOCIAL_WARMUP_BLUEPRINT_VERSION,
      events: [],
      signals: [],
      startedAt: now,
      state: 'ENROLLED',
    });

    const gate = await service.evaluateScheduledPublishGate({
      brandId: 'brand-1',
      credentialId: 'credential-1',
      organizationId: 'org-1',
    });

    expect(gate.holdPublishing).toBe(true);
    expect(gate.reason).toMatch(/required warm-up checks are incomplete/i);
    expect(gate.reason).toMatch(/Use TikTok manually/i);
    expect(gate.reason).toMatch(/does not guarantee reach or safety/i);
  });

  it('does not treat credential createdAt as native social-account age', async () => {
    prisma.credential.findFirst.mockResolvedValueOnce(
      makeCredential({
        createdAt: new Date('2020-01-01T00:00:00.000Z'),
      }),
    );

    const summary = await service.assessCredentialHealth({
      credentialId: 'credential-1',
      organizationId: 'org-1',
    });

    expect(summary.signals.connectedDays).toBe(0);
    expect(summary.signals.accountAgeDays).toBeNull();
    expect(summary.signals.accountAgeStatus).toBe('MISSING');
  });

  it('scores connected days from first-upload platform evidence', async () => {
    prisma.socialWarmupEnrollment.findFirst.mockResolvedValueOnce({
      signals: [
        {
          evidence: {
            video: {
              createTime: Math.floor(now.getTime() / 1000) - 10 * 24 * 60 * 60,
            },
          },
          key: 'first-upload-platform-signal',
          source: 'PLATFORM',
          status: 'AVAILABLE',
        },
      ],
    });

    const summary = await service.assessCredentialHealth({
      credentialId: 'credential-1',
      organizationId: 'org-1',
    });

    expect(summary.signals.accountAgeStatus).toBe('AVAILABLE');
    expect(summary.signals.accountAgeDays).toBe(10);
    expect(summary.signals.connectedDays).toBe(10);
    expect(summary.signals.accountAgeSource).toBe(
      'first-upload-platform-signal',
    );
  });

  it('keeps stale account-age evidence distinct from failed and missing', async () => {
    prisma.socialWarmupEnrollment.findFirst.mockResolvedValueOnce({
      signals: [
        {
          evidence: { video: { createTime: 1_700_000_000 } },
          key: 'first-upload-platform-signal',
          source: 'PLATFORM',
          status: 'STALE',
        },
      ],
    });

    const stale = await service.assessCredentialHealth({
      credentialId: 'credential-1',
      organizationId: 'org-1',
    });
    expect(stale.signals.accountAgeStatus).toBe('STALE');

    prisma.socialWarmupEnrollment.findFirst.mockResolvedValueOnce({
      signals: [
        {
          evidence: {},
          key: 'first-upload-platform-signal',
          source: 'PLATFORM',
          status: 'FAILED',
        },
      ],
    });
    const failed = await service.assessCredentialHealth({
      credentialId: 'credential-1',
      organizationId: 'org-1',
    });
    expect(failed.signals.accountAgeStatus).toBe('FAILED');
    expect(failed.signals.accountAgeDays).toBeNull();
  });
});
