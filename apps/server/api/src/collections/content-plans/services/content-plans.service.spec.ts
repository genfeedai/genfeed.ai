import { ContentPlansService } from '@api/collections/content-plans/services/content-plans.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ContentPlanStatus } from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('ContentPlansService.patch', () => {
  const organizationId = 'org-1';
  const planId = 'plan-1';
  const findFirst = vi.fn();
  const update = vi.fn();
  const service = new ContentPlansService(
    { contentPlan: { findFirst, update } } as unknown as PrismaService,
    { error: vi.fn(), log: vi.fn(), warn: vi.fn() } as unknown as LoggerService,
  );

  beforeEach(() => {
    findFirst.mockReset();
    update.mockReset();
  });

  it('scopes the lookup to organizationId and never the organization alias', async () => {
    const existing = {
      config: { name: 'Plan' },
      createdById: 'user-1',
      id: planId,
      label: 'Plan',
      organizationId,
    };
    findFirst.mockResolvedValue(existing);
    update.mockResolvedValue({
      ...existing,
      config: { name: 'Renamed', status: ContentPlanStatus.DRAFT },
      label: 'Renamed',
    });

    await service.patch(planId, {
      name: 'Renamed',
      organizationId,
    });

    expect(findFirst).toHaveBeenCalledWith({
      where: {
        id: planId,
        isDeleted: false,
        organizationId,
      },
    });
  });

  it('fails closed when organizationId is missing', async () => {
    await expect(
      service.patch(planId, {
        name: 'Renamed',
        organization: organizationId,
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(findFirst).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
});

describe('ContentPlansService.incrementExecutedCount', () => {
  it('increments the scalar column atomically instead of a JSON RMW', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const service = new ContentPlansService(
      {
        contentPlan: {
          updateMany,
        },
      } as never,
      { debug: vi.fn(), error: vi.fn(), log: vi.fn(), warn: vi.fn() } as never,
    );

    await service.incrementExecutedCount('org-1', 'plan-1', 'brand-1');

    expect(updateMany).toHaveBeenCalledWith({
      data: { executedCount: { increment: 1 } },
      where: {
        brandId: 'brand-1',
        id: 'plan-1',
        isDeleted: false,
        organizationId: 'org-1',
      },
    });
  });
});
