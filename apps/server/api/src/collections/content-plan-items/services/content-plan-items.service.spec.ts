import { ContentPlanItemsService } from '@api/collections/content-plan-items/services/content-plan-items.service';
import { ContentPlanItemStatus } from '@genfeedai/enums';
import { describe, expect, it, vi } from 'vitest';

describe('ContentPlanItemsService scalar filters', () => {
  const contentPlanItem = {
    create: vi.fn(),
    findMany: vi.fn().mockResolvedValue([]),
    update: vi.fn(),
  };
  const service = new ContentPlanItemsService(
    { contentPlanItem } as never,
    { debug: vi.fn(), error: vi.fn(), log: vi.fn(), warn: vi.fn() } as never,
  );

  it('lists a plan by scheduledAt instead of sorting JSON in memory', async () => {
    await service.listByPlan('org-1', 'plan-1');

    expect(contentPlanItem.findMany).toHaveBeenCalledWith({
      orderBy: [{ scheduledAt: 'asc' }, { createdAt: 'asc' }],
      where: {
        isDeleted: false,
        organizationId: 'org-1',
        planId: 'plan-1',
      },
    });
  });

  it('filters pending items on the typed status column', async () => {
    await service.listPendingByPlan('org-1', 'plan-1');

    expect(contentPlanItem.findMany).toHaveBeenCalledWith({
      orderBy: [{ scheduledAt: 'asc' }, { createdAt: 'asc' }],
      where: {
        isDeleted: false,
        organizationId: 'org-1',
        planId: 'plan-1',
        status: ContentPlanItemStatus.PENDING,
      },
    });
  });
});
