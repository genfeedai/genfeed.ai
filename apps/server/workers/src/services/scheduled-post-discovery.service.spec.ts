import { ScheduledPostDiscoveryService } from '@workers/services/scheduled-post-discovery.service';
import { describe, expect, it, vi } from 'vitest';

describe('ScheduledPostDiscoveryService', () => {
  it('sweeps never-attempted posts first, then the oldest due', async () => {
    const findAll = vi.fn().mockResolvedValue({ docs: [] });
    const service = new ScheduledPostDiscoveryService({ findAll } as never);

    await service.findDuePosts();

    expect(findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [
          { lastAttemptAt: { nulls: 'first', sort: 'asc' } },
          { scheduledDate: { nulls: 'last', sort: 'asc' } },
          { id: 'asc' },
        ],
      }),
      expect.objectContaining({ limit: 50 }),
    );
  });

  it('honors an explicit sweep limit', async () => {
    const findAll = vi.fn().mockResolvedValue({ docs: [] });
    const service = new ScheduledPostDiscoveryService({ findAll } as never);

    await service.findDuePosts({ limit: 5 });

    expect(findAll).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ limit: 5 }),
    );
  });
});
