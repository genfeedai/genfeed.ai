import { ScheduledPostDiscoveryService } from '@workers/services/scheduled-post-discovery.service';
import { describe, expect, it } from 'vitest';

// How the keyset predicate orders and pages real rows is proven against a real
// database in `isolated-publish/sweep-burst.integration.spec.ts`.
function discoveryReturning(docs: Array<Record<string, unknown>>) {
  return new ScheduledPostDiscoveryService({
    findAll: async () => ({ docs }),
  } as never);
}

describe('ScheduledPostDiscoveryService', () => {
  it('returns a cursor on the last post when the page is full', async () => {
    const lastAttemptAt = new Date('2026-11-16T07:00:00.000Z');
    const scheduledDate = new Date('2026-11-16T06:00:00.000Z');
    const service = discoveryReturning([
      { id: 'a', lastAttemptAt: null, scheduledDate },
      { id: 'b', lastAttemptAt, scheduledDate },
    ]);

    const page = await service.findDuePostsPage({ limit: 2 });

    expect(page.nextCursor).toEqual({
      id: 'b',
      lastAttemptAt,
      scheduledDate,
    });
  });

  it('returns no cursor when the page is not full', async () => {
    const service = discoveryReturning([{ id: 'a' }]);

    const page = await service.findDuePostsPage({ limit: 2 });

    expect(page.nextCursor).toBeNull();
  });

  it('returns the posts of one page for the single-page lookup', async () => {
    const service = discoveryReturning([{ id: 'a' }, { id: 'b' }]);

    const posts = await service.findDuePosts({ limit: 2 });

    expect(posts.map((post) => String(post.id))).toEqual(['a', 'b']);
  });
});
