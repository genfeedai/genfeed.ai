import { randomUUID } from 'node:crypto';
import { PostsService } from '@api/collections/posts/services/posts.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { PostCategory, TargetExecutionState } from '@genfeedai/contracts';
import { PrismaClient } from '@genfeedai/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { loadScheduledActionPost } from '@workers/services/scheduled-post-action-load.util';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.unmock('@genfeedai/prisma');
vi.unmock('@prisma/adapter-pg');

// Explicit opt-in only: CI provisions this fully migrated, disposable database
// for the *.postgres.spec.ts suites. Never DATABASE_URL, never a shared server.
const connectionString = process.env.BILLING_ACCOUNT_SCOPE_TEST_DATABASE_URL;
if (connectionString) {
  const url = new URL(connectionString);
  if (
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
    !/test/i.test(url.pathname)
  ) {
    throw new Error('Post media order proof needs a disposable local database');
  }
}

describe.skipIf(!connectionString)(
  'post media order against a fully migrated PostgreSQL (#6740)',
  () => {
    const prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: connectionString ?? '' }),
    });
    const logger = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };
    const service = new PostsService(
      prisma as unknown as PrismaService,
      logger as never,
      { completeMissions: vi.fn().mockResolvedValue([]) } as never,
    );

    const suffix = randomUUID();
    const userId = `owner-${suffix}`;
    const organizationId = `org-${suffix}`;
    const brandId = `brand-${suffix}`;
    // Id order (a, b, c) and group order (c, b, a) both disagree with the
    // arrangements below, so only a stored position can produce them.
    const media = {
      a: `ing-a-${suffix}`,
      b: `ing-b-${suffix}`,
      c: `ing-c-${suffix}`,
    };

    beforeAll(async () => {
      await prisma.user.create({ data: { handle: userId, id: userId } });
      await prisma.organization.create({
        data: {
          id: organizationId,
          label: organizationId,
          slug: organizationId,
          userId,
        },
      });
      await prisma.brand.create({
        data: {
          id: brandId,
          label: brandId,
          organizationId,
          slug: brandId,
          userId,
        },
      });
      for (const [key, groupIndex] of [
        ['a', 2],
        ['b', 1],
        ['c', 0],
      ] as const) {
        await prisma.ingredient.create({
          data: {
            brandId,
            groupIndex,
            id: media[key],
            organizationId,
            userId,
          },
        });
      }
    });
    afterAll(async () => {
      await prisma.$disconnect();
    });

    const idsOf = (post: { ingredients?: unknown[] } | null): string[] =>
      (post?.ingredients ?? []).map((item) =>
        typeof item === 'string' ? item : (item as { id: string }).id,
      );

    async function storedOrder(postId: string): Promise<string[]> {
      const links = await prisma.postIngredient.findMany({
        orderBy: { position: 'asc' },
        select: { ingredientId: true, organizationId: true, position: true },
        where: { postId },
      });
      expect(links.map((link) => link.position)).toEqual(
        links.map((_, index) => index),
      );
      expect(new Set(links.map((link) => link.organizationId))).toEqual(
        new Set(links.length ? [organizationId] : []),
      );
      return links.map((link) => link.ingredientId);
    }

    it('persists the arranged slide order and reads it back in that order', async () => {
      const created = await service.create({
        brandId,
        category: PostCategory.IMAGE,
        description: 'A carousel',
        ingredients: [media.c, media.a, media.b],
        organizationId,
        userId,
      });

      expect(idsOf(created)).toEqual([media.c, media.a, media.b]);
      expect(await storedOrder(created.id)).toEqual([
        media.c,
        media.a,
        media.b,
      ]);
      expect(idsOf(await service.findOne({ id: created.id }))).toEqual([
        media.c,
        media.a,
        media.b,
      ]);
    });

    it('rewrites every position when the slides are reordered', async () => {
      const created = await service.create({
        brandId,
        category: PostCategory.IMAGE,
        description: 'A carousel to reorder',
        ingredients: [media.a, media.b, media.c],
        organizationId,
        userId,
      });

      const reordered = await service.patch(created.id, {
        ingredients: [media.c, media.b, media.a],
      });

      expect(idsOf(reordered)).toEqual([media.c, media.b, media.a]);
      expect(await storedOrder(created.id)).toEqual([
        media.c,
        media.b,
        media.a,
      ]);
      expect(
        await prisma.postIngredient.count({ where: { postId: created.id } }),
      ).toBe(3);

      await service.patch(created.id, { ingredients: [media.b] });
      expect(await storedOrder(created.id)).toEqual([media.b]);
      await service.patch(created.id, { ingredients: [] });
      expect(await storedOrder(created.id)).toEqual([]);
    });

    it('keeps one link when the same media is arranged twice', async () => {
      const created = await service.create({
        brandId,
        category: PostCategory.IMAGE,
        description: 'Repeated media',
        ingredients: [media.b, media.a, media.b],
        organizationId,
        userId,
      });

      expect(await storedOrder(created.id)).toEqual([media.b, media.a]);
    });

    it('delivers a scheduled carousel in position order', async () => {
      const created = await service.create({
        brandId,
        category: PostCategory.IMAGE,
        description: 'Scheduled carousel',
        ingredients: [media.b, media.c, media.a],
        organizationId,
        userId,
      });
      await prisma.post.update({
        data: { targetExecutionState: TargetExecutionState.SCHEDULED },
        where: { id: created.id },
      });

      const post = await loadScheduledActionPost(
        prisma as unknown as PrismaService,
        { organizationId, postId: created.id } as Parameters<
          typeof loadScheduledActionPost
        >[1],
      );

      expect(idsOf(post)).toEqual([media.b, media.c, media.a]);
    });
  },
);
