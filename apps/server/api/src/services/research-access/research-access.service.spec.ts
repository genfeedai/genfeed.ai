import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { SubscriptionStatus, SubscriptionTier } from '@genfeedai/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ResearchAccessService } from './research-access.service';
import { runWithResearchScanGrant } from './research-scan.context';

vi.mock('@genfeedai/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@genfeedai/config')>();

  return {
    ...actual,
    isSaaS: vi.fn(() => true),
  };
});

import { isSaaS } from '@genfeedai/config';

describe('ResearchAccessService', () => {
  const findMany = vi.fn();
  const findFirst = vi.fn();
  const prisma = {
    organizationSetting: { findFirst },
    subscription: { findMany },
  } as unknown as PrismaService;
  const service = new ResearchAccessService(prisma);

  beforeEach(() => {
    vi.mocked(isSaaS).mockReturnValue(true);
    findMany.mockReset();
    findFirst.mockReset();
  });

  it('reads the organization subscription and ignores session bypasses', async () => {
    findMany.mockResolvedValue([
      {
        cancelAtPeriodEnd: false,
        currentPeriodEnd: new Date('2026-10-24T00:00:00.000Z'),
        plan: 'monthly',
        status: SubscriptionStatus.ACTIVE,
      },
    ]);
    findFirst.mockResolvedValue({ subscriptionTier: SubscriptionTier.SCALE });

    await expect(
      service.decide('org-1', new Date('2026-09-24T00:00:00.000Z')),
    ).resolves.toEqual({ isAllowed: true, reason: 'active_paid' });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isDeleted: false, organizationId: 'org-1' },
      }),
    );
  });

  it('fails closed when the subscription query throws', async () => {
    findMany.mockRejectedValue(new Error('db down'));
    findFirst.mockResolvedValue(null);
    await expect(service.decide('org-1')).resolves.toEqual({
      isAllowed: false,
      reason: 'research_subscription_unverified',
    });
  });

  it('does not query subscriptions on a self-hosted deployment', async () => {
    vi.mocked(isSaaS).mockReturnValue(false);
    await expect(service.decide('org-1')).resolves.toEqual({
      isAllowed: true,
      reason: 'self_hosted',
    });
    expect(findMany).not.toHaveBeenCalled();
  });

  describe('inside a reserved scan', () => {
    const grant = (organizationId: string) => ({
      hasStartedRun: false,
      library: 'trends' as const,
      organizationId,
      scanId: 'scan-1',
    });

    it('lets that organization collect without a plan', async () => {
      findMany.mockResolvedValue([]);
      findFirst.mockResolvedValue({ subscriptionTier: SubscriptionTier.FREE });

      await expect(
        runWithResearchScanGrant(grant('org-1'), () => service.decide('org-1')),
      ).resolves.toEqual({ isAllowed: true, reason: 'scan_reserved' });
      await expect(service.decide('org-1')).resolves.toEqual({
        isAllowed: false,
        reason: 'research_paid_access_required',
      });
    });

    it('does not admit another organization, or an unreadable plan', async () => {
      findMany.mockResolvedValue([]);
      findFirst.mockResolvedValue(null);
      await expect(
        runWithResearchScanGrant(grant('org-2'), () => service.decide('org-1')),
      ).resolves.toEqual({
        isAllowed: false,
        reason: 'research_paid_access_required',
      });

      findMany.mockRejectedValue(new Error('db down'));
      await expect(
        runWithResearchScanGrant(grant('org-1'), () => service.decide('org-1')),
      ).resolves.toEqual({
        isAllowed: false,
        reason: 'research_subscription_unverified',
      });
    });
  });

  it('resolves the tier whose scan limit applies', async () => {
    findMany.mockResolvedValue([
      {
        cancelAtPeriodEnd: false,
        currentPeriodEnd: new Date('2026-10-24T00:00:00.000Z'),
        plan: 'monthly',
        status: SubscriptionStatus.ACTIVE,
      },
    ]);
    findFirst.mockResolvedValue({ subscriptionTier: SubscriptionTier.SCALE });

    await expect(
      service.resolve('org-1', new Date('2026-09-24T00:00:00.000Z')),
    ).resolves.toMatchObject({ tier: SubscriptionTier.SCALE });
  });
});
