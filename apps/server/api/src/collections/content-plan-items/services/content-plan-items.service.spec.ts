import { ContentPlanItemsService } from '@api/collections/content-plan-items/services/content-plan-items.service';
import { ContentPlanItemStatus } from '@genfeedai/contracts';
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

describe('ContentPlanItemsService.updateContent', () => {
  const contentPlanItem = {
    create: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn().mockResolvedValue([]),
    update: vi.fn(),
  };
  const service = new ContentPlanItemsService(
    { contentPlanItem } as never,
    { debug: vi.fn(), error: vi.fn(), log: vi.fn(), warn: vi.fn() } as never,
  );

  it('merges an operator edit into the item payload, org-scoped', async () => {
    contentPlanItem.findFirst.mockResolvedValue({
      data: { platforms: ['linkedin'], prompt: 'Old prompt', topic: 'Old' },
      id: 'item-1',
      organizationId: 'org-1',
      planId: 'plan-1',
      status: ContentPlanItemStatus.PENDING,
    });
    contentPlanItem.update.mockImplementation(({ data }) =>
      Promise.resolve({
        data: data.data,
        id: 'item-1',
        organizationId: 'org-1',
        planId: 'plan-1',
        status: ContentPlanItemStatus.PENDING,
      }),
    );

    const item = await service.updateContent('org-1', 'item-1', {
      topic: 'Cash flow is designed',
    });

    expect(contentPlanItem.update).toHaveBeenCalledWith({
      data: {
        data: {
          platforms: ['linkedin'],
          prompt: 'Old prompt',
          topic: 'Cash flow is designed',
        },
      },
      where: { id: 'item-1', isDeleted: false, organizationId: 'org-1' },
    });
    expect(item.topic).toBe('Cash flow is designed');
  });

  it('refuses to edit an item in another organization', async () => {
    contentPlanItem.findFirst.mockResolvedValue(null);

    await expect(
      service.updateContent('org-1', 'item-1', { topic: 'Nope' }),
    ).rejects.toThrow();
    expect(contentPlanItem.update).not.toHaveBeenCalled();
  });
});
