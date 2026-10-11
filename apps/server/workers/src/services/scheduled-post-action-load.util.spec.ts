import { loadScheduledActionPost } from '@workers/services/scheduled-post-action-load.util';
import { describe, expect, it, vi } from 'vitest';

function prismaReturning(post: unknown) {
  return {
    post: {
      findFirst: vi.fn().mockResolvedValue(post),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
}

const input = { organizationId: 'org-1', postId: 'post-1' } as Parameters<
  typeof loadScheduledActionPost
>[1];

describe('loadScheduledActionPost', () => {
  it('loads root and child ingredients in carousel order (group index, then id)', async () => {
    const prisma = prismaReturning({
      category: 'IMAGE',
      id: 'post-1',
      ingredients: [{ category: 'image' }],
    });

    await loadScheduledActionPost(
      prisma as unknown as Parameters<typeof loadScheduledActionPost>[0],
      input,
    );

    const args = prisma.post.findFirst.mock.calls[0]?.[0] as {
      include: {
        children: { include: { ingredients: unknown } };
        ingredients: unknown;
      };
    };
    const order = { orderBy: [{ groupIndex: 'asc' }, { id: 'asc' }] };
    expect(args.include.ingredients).toEqual(order);
    expect(args.include.children.include.ingredients).toEqual(order);
  });

  it('returns null when no scheduled root post matches', async () => {
    const prisma = prismaReturning(null);

    await expect(
      loadScheduledActionPost(
        prisma as unknown as Parameters<typeof loadScheduledActionPost>[0],
        input,
      ),
    ).resolves.toBeNull();
  });
});
