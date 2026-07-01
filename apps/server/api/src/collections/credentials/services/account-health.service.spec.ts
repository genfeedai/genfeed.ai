import { AccountHealthService } from '@api/collections/credentials/services/account-health.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { CredentialPlatform, PostStatus } from '@genfeedai/enums';
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
    credential: {
      findFirst: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    post: {
      count: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);

    prisma = {
      credential: {
        findFirst: vi.fn().mockResolvedValue(makeCredential()),
        findMany: vi.fn().mockResolvedValue([]),
        update: vi.fn().mockResolvedValue(makeCredential()),
      },
      post: {
        count: vi.fn().mockResolvedValue(0),
      },
    };

    service = new AccountHealthService(prisma as unknown as PrismaService);
  });

  afterEach(() => {
    vi.useRealTimers();
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
    expect(prisma.credential.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          warmupHoldReason: expect.stringContaining(
            'tiktok publishing is held',
          ),
          warmupState: 'not_started',
        }),
        where: { id: 'credential-1' },
      }),
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
          status: PostStatus.PUBLIC,
        }),
      }),
    );
    expect(summary.signals.publishedPosts).toBe(3);
    expect(summary.signals.recentFailures).toBe(1);
    expect(summary.state).toBe('risky');
  });
});
