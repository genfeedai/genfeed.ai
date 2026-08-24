import { AccountHealthService } from '@api/collections/credentials/services/account-health.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { postExecutionStateReadFilter } from '@api-types/contracts/scheduler.contract';
import {
  TIKTOK_SOCIAL_WARMUP_BLUEPRINT_ID,
  TIKTOK_SOCIAL_WARMUP_BLUEPRINT_VERSION,
} from '@api-types/contracts/social-warmup-blueprint.contract';
import { CredentialPlatform, TargetExecutionState } from '@genfeedai/enums';
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
    };
    socialWarmupEnrollment: {
      findFirst: ReturnType<typeof vi.fn>;
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
      },
      socialWarmupEnrollment: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    };

    service = new AccountHealthService(prisma as unknown as PrismaService);
  });

  afterEach(() => {
    vi.useRealTimers();
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
