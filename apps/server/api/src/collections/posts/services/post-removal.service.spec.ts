import type { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { PostRemovalService } from '@api/collections/posts/services/post-removal.service';
import type { PostsService } from '@api/collections/posts/services/posts.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { describe, expect, it, vi } from 'vitest';

interface PostRow {
  brandId: string;
  entityIngredientId?: string | null;
  id: string;
  isDeleted: boolean;
  media: string[];
  organizationId: string;
  parentId?: string | null;
  platform: string | null;
  status: string;
  url: string | null;
}

/**
 * An in-memory library and post table that answers only the queries the
 * service sends, so a query it did not expect fails the spec.
 */
function build(options: {
  assets: Record<string, { editable: boolean }>;
  posts: PostRow[];
}) {
  const posts = options.posts.map((post) => ({ ...post }));
  const assets = new Map(
    Object.entries(options.assets).map(([id, asset]) => [
      id,
      { ...asset, isDeleted: false },
    ]),
  );
  const liveLinks = (post: PostRow) =>
    post.media
      .filter((id) => assets.get(id)?.isDeleted === false)
      .map((ingredientId) => ({ ingredientId }));
  const inScope = (where: Record<string, unknown>, post: PostRow) =>
    post.organizationId === where.organizationId &&
    post.isDeleted === where.isDeleted;

  const prisma = {
    ingredient: {
      findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
        where.id.in
          .filter((id) => assets.get(id)?.isDeleted === false)
          .map((id) => ({ id })),
      ),
    },
    post: {
      findFirst: vi.fn(
        async ({ where }: { where: Record<string, unknown> }) => {
          const notIn = (where.id as { notIn?: string[] } | undefined)?.notIn;
          const or = where.OR as
            | {
                entityIngredientId?: string;
                ingredientLinks?: { some: { ingredientId: string } };
              }[]
            | undefined;
          const post = posts.find((row) => {
            if (!inScope(where, row)) return false;
            if (notIn) {
              // "Another live post uses this media": a link or an entity pointer.
              return (
                !notIn.includes(row.id) &&
                (or ?? []).some(
                  (clause) =>
                    (clause.entityIngredientId !== undefined &&
                      clause.entityIngredientId === row.entityIngredientId) ||
                    (clause.ingredientLinks !== undefined &&
                      row.media.includes(
                        clause.ingredientLinks.some.ingredientId,
                      )),
                )
              );
            }
            return (
              row.id === where.id &&
              (where.brandId === undefined || row.brandId === where.brandId)
            );
          });
          return post ? { ...post, ingredientLinks: liveLinks(post) } : null;
        },
      ),
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const ids = (where.id as { notIn: string[] } | undefined)?.notIn;
        const entity = (
          where.entityIngredientId as { in: string[] } | undefined
        )?.in;
        return posts
          .filter(
            (row) =>
              inScope(where, row) &&
              (where.parentId === undefined ||
                row.parentId === where.parentId) &&
              !ids?.includes(row.id) &&
              (!entity || entity.includes(row.entityIngredientId ?? '')),
          )
          .map((row) => ({ ...row, ingredientLinks: liveLinks(row) }));
      }),
    },
  };
  const postsService = {
    remove: vi.fn(async (id: string) => {
      const post = posts.find((row) => row.id === id);
      if (!post) return null;
      for (const child of posts.filter((row) => row.parentId === id)) {
        child.isDeleted = true;
      }
      post.isDeleted = true;
      return post;
    }),
  };
  const ingredientsService = {
    softDeleteOneScoped: vi.fn(async ({ id }: { id: string }) => {
      const asset = assets.get(id);
      if (!asset || asset.isDeleted || !asset.editable) return null;
      asset.isDeleted = true;
      return { id };
    }),
  };
  const logger = { log: vi.fn(), warn: vi.fn() };
  const service = new PostRemovalService(
    prisma as unknown as PrismaService,
    postsService as unknown as PostsService,
    ingredientsService as unknown as IngredientsService,
    logger as unknown as LoggerService,
  );
  return { assets, posts, service };
}

const params = {
  editor: { brandId: 'brand-1', userId: 'user-1' },
  organizationId: 'org-1',
};

function post(overrides: Partial<PostRow> & { id: string }): PostRow {
  return {
    brandId: 'brand-1',
    isDeleted: false,
    media: [],
    organizationId: 'org-1',
    platform: 'instagram',
    status: 'public',
    url: 'https://www.instagram.com/p/abc/',
    ...overrides,
  };
}

describe('PostRemovalService', () => {
  it('deletes a published post and the media only it uses, and says the platform copy stays', async () => {
    const { assets, posts, service } = build({
      assets: {
        a1: { editable: true },
        a2: { editable: true },
        shared: { editable: true },
      },
      posts: [
        post({ id: 'p1', media: ['a1', 'a2', 'shared'] }),
        post({ id: 'p2', media: ['shared'], status: 'draft' }),
      ],
    });

    const result = await service.removePost({
      ...params,
      includeMedia: true,
      postId: 'p1',
    });

    expect(result).toEqual({
      deletedOnPlatform: false,
      media: {
        deleted: ['a1', 'a2'],
        kept: [{ id: 'shared', reason: 'used-by-another-post' }],
      },
      platform: 'instagram',
      postId: 'p1',
      previousStatus: 'public',
      publishedUrl: 'https://www.instagram.com/p/abc/',
      verified: { mediaGone: true, postGone: true },
    });
    expect(posts.map((row) => [row.id, row.isDeleted])).toEqual([
      ['p1', true],
      ['p2', false],
    ]);
    expect(assets.get('shared')?.isDeleted).toBe(false);
  });

  it('keeps every asset unless the caller asks for the media', async () => {
    const { assets, service } = build({
      assets: { a1: { editable: true } },
      posts: [post({ id: 'p1', media: ['a1'] })],
    });

    const result = await service.removePost({
      ...params,
      includeMedia: false,
      postId: 'p1',
    });

    expect(result?.media).toEqual({ deleted: [], kept: [] });
    expect(result?.verified.postGone).toBe(true);
    expect(assets.get('a1')?.isDeleted).toBe(false);
  });

  it('keeps media the caller may not edit and reports why', async () => {
    const { assets, service } = build({
      assets: { mine: { editable: true }, theirs: { editable: false } },
      posts: [post({ id: 'p1', media: ['mine', 'theirs'] })],
    });

    const result = await service.removePost({
      ...params,
      includeMedia: true,
      postId: 'p1',
    });

    expect(result?.media).toEqual({
      deleted: ['mine'],
      kept: [{ id: 'theirs', reason: 'not-editable' }],
    });
    expect(assets.get('theirs')?.isDeleted).toBe(false);
  });

  it('counts the media of thread replies as the post own, and an entity ingredient as use', async () => {
    const { assets, service } = build({
      assets: {
        reply: { editable: true },
        video: { editable: true },
      },
      posts: [
        post({ entityIngredientId: 'video', id: 'p1' }),
        post({ id: 'r1', media: ['reply'], parentId: 'p1' }),
      ],
    });

    const result = await service.removePost({
      ...params,
      includeMedia: true,
      postId: 'p1',
    });

    expect(result?.media.deleted.sort()).toEqual(['reply', 'video']);
    expect(assets.get('reply')?.isDeleted).toBe(true);
  });

  it('does not find a post of another organization or brand', async () => {
    const { posts, service } = build({
      assets: {},
      posts: [post({ id: 'p1', organizationId: 'org-2' }), post({ id: 'p3' })],
    });

    await expect(
      service.removePost({ ...params, includeMedia: false, postId: 'p1' }),
    ).resolves.toBeNull();
    await expect(
      service.removePost({
        ...params,
        brandId: 'brand-9',
        includeMedia: false,
        postId: 'p3',
      }),
    ).resolves.toBeNull();
    expect(posts.every((row) => !row.isDeleted)).toBe(true);
  });

  it('is not found a second time', async () => {
    const { service } = build({ assets: {}, posts: [post({ id: 'p1' })] });

    await service.removePost({ ...params, includeMedia: false, postId: 'p1' });

    await expect(
      service.removePost({ ...params, includeMedia: false, postId: 'p1' }),
    ).resolves.toBeNull();
  });
});
