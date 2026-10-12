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

const link = (id: string, category = 'image') => ({
  ingredient: { category, id },
  ingredientId: id,
});

describe('loadScheduledActionPost', () => {
  it('loads root and child media in the slide order the user arranged', async () => {
    const prisma = prismaReturning({
      category: 'IMAGE',
      children: [],
      id: 'post-1',
      ingredientLinks: [link('ing-1')],
    });

    await loadScheduledActionPost(
      prisma as unknown as Parameters<typeof loadScheduledActionPost>[0],
      input,
    );

    const args = prisma.post.findFirst.mock.calls[0]?.[0] as {
      include: {
        children: { include: { ingredientLinks: unknown } };
        ingredientLinks: unknown;
      };
    };
    const order = {
      include: { ingredient: true },
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
    };
    expect(args.include.ingredientLinks).toEqual(order);
    expect(args.include.children.include.ingredientLinks).toEqual(order);
  });

  it('delivers the media in position order, not id order', async () => {
    // The database returns the links by position: slide 0 has the highest id.
    const prisma = prismaReturning({
      category: 'IMAGE',
      children: [
        {
          id: 'child-1',
          ingredientLinks: [link('ing-9'), link('ing-3')],
        },
      ],
      id: 'post-1',
      ingredientLinks: [link('ing-c'), link('ing-a'), link('ing-b')],
    });

    const post = await loadScheduledActionPost(
      prisma as unknown as Parameters<typeof loadScheduledActionPost>[0],
      input,
    );

    expect(
      (
        post as unknown as { ingredients: Array<{ id: string }> }
      ).ingredients.map((ingredient) => ingredient.id),
    ).toEqual(['ing-c', 'ing-a', 'ing-b']);
    expect(
      (
        post as unknown as {
          children: Array<{ ingredients: Array<{ id: string }> }>;
        }
      ).children[0]?.ingredients.map((ingredient) => ingredient.id),
    ).toEqual(['ing-9', 'ing-3']);
    expect(post).not.toHaveProperty('ingredientLinks');
  });

  it('corrects and persists a category the linked media disprove', async () => {
    const prisma = prismaReturning({
      category: 'TEXT',
      children: [],
      id: 'post-1',
      ingredientLinks: [link('ing-1', 'video')],
    });

    const post = await loadScheduledActionPost(
      prisma as unknown as Parameters<typeof loadScheduledActionPost>[0],
      input,
    );

    expect(post).toMatchObject({ category: 'VIDEO' });
    expect(prisma.post.updateMany).toHaveBeenCalledWith({
      data: { category: 'VIDEO' },
      where: expect.objectContaining({ id: 'post-1' }),
    });
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
