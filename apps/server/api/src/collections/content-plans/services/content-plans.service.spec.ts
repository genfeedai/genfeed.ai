import { ContentPlansService } from '@api/collections/content-plans/services/content-plans.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ContentPlanStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException } from '@nestjs/common';

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
