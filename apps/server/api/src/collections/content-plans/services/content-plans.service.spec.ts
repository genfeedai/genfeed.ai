import { ContentPlansService } from '@api/collections/content-plans/services/content-plans.service';
import { describe, expect, it, vi } from 'vitest';

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
