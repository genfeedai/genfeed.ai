import { SuperAdminGuard } from '@api/common/guards/super-admin.guard';
import { IpWhitelistGuard } from '@api/endpoints/admin/guards/ip-whitelist.guard';
import { describe, expect, it, vi } from 'vitest';
import { AdminSeedsController } from './seeds.controller';

describe('AdminSeedsController', () => {
  it('requires the IP allowlist and a super admin', () => {
    expect(Reflect.getMetadata('__guards__', AdminSeedsController)).toEqual([
      IpWhitelistGuard,
      SuperAdminGuard,
    ]);
  });

  it('hands each body to the matching seed', async () => {
    const seeds = {
      seedArticles: vi.fn().mockResolvedValue({ created: 1 }),
      seedWorkflows: vi.fn().mockResolvedValue({ updated: 2 }),
    };
    const controller = new AdminSeedsController(seeds as never);

    await expect(
      controller.articles({ ownerEmail: 'a@b.co' }),
    ).resolves.toEqual({ created: 1 });
    await expect(controller.workflows({ allBrands: true })).resolves.toEqual({
      updated: 2,
    });

    expect(seeds.seedArticles).toHaveBeenCalledWith({ ownerEmail: 'a@b.co' });
    expect(seeds.seedWorkflows).toHaveBeenCalledWith({ allBrands: true });
  });
});
