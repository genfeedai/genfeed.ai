import { PUBLIC_POSTS_ORDER_BY } from '@api/endpoints/public/utils/public-posts-order.util';
import { type Prisma, PrismaClient } from '@genfeedai/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, describe, expect, it, vi } from 'vitest';

/**
 * Runs the public posts order against a real, migrated PostgreSQL. Point
 * PUBLIC_POSTS_ORDER_TEST_DATABASE_URL at a disposable local database whose
 * name starts with `public_posts_order`; every test runs in a transaction that
 * is rolled back, with foreign keys relaxed for its rows
 * (`session_replication_role = replica`, which needs a superuser).
 */
vi.unmock('@genfeedai/prisma');
vi.unmock('@prisma/adapter-pg');

const connectionString = process.env.PUBLIC_POSTS_ORDER_TEST_DATABASE_URL;
if (connectionString !== undefined) {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error('A disposable local public-posts database is required.');
  }
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !['localhost', '127.0.0.1'].includes(url.hostname) ||
    !url.pathname.startsWith('/public_posts_order')
  ) {
    throw new Error('A disposable local public-posts database is required.');
  }
}

const ORG = 'org-1';

class RollbackSignal extends Error {}

interface PostSeed {
  createdAt: string;
  id: string;
  publicationDate?: string;
  publishedAt?: string;
}

describe.skipIf(!connectionString)(
  'public posts order on real PostgreSQL',
  () => {
    const prisma = connectionString
      ? new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
      : null;

    afterAll(async () => {
      await prisma?.$disconnect();
    });

    async function inRolledBackTransaction(
      work: (tx: Prisma.TransactionClient) => Promise<void>,
    ): Promise<void> {
      if (!prisma) {
        throw new Error('Public posts database is not configured.');
      }
      await prisma
        .$transaction(async (tx) => {
          await tx.$executeRaw`SET LOCAL session_replication_role = replica`;
          await work(tx);
          throw new RollbackSignal();
        })
        .catch((error: unknown) => {
          if (!(error instanceof RollbackSignal)) {
            throw error;
          }
        });
    }

    async function seed(
      tx: Prisma.TransactionClient,
      posts: PostSeed[],
    ): Promise<void> {
      for (const post of posts) {
        await tx.post.create({
          data: {
            brandId: 'brand-1',
            createdAt: new Date(post.createdAt),
            description: post.id,
            id: post.id,
            organizationId: ORG,
            publicationDate: post.publicationDate
              ? new Date(post.publicationDate)
              : null,
            publishedAt: post.publishedAt ? new Date(post.publishedAt) : null,
            userId: 'user-1',
          },
        });
      }
    }

    async function page(
      tx: Prisma.TransactionClient,
      skip: number,
      take: number,
    ): Promise<string[]> {
      const rows = await tx.post.findMany({
        orderBy: PUBLIC_POSTS_ORDER_BY,
        select: { id: true },
        skip,
        take,
        where: { organizationId: ORG },
      });
      return rows.map((row) => row.id);
    }

    it('lists a post drafted early and published late ahead of one created and published in between', async () => {
      await inRolledBackTransaction(async (tx) => {
        await seed(tx, [
          {
            createdAt: '2026-11-01T09:00:00Z',
            id: 'drafted-early-published-late',
            publishedAt: '2026-11-20T09:00:00Z',
          },
          {
            createdAt: '2026-11-10T09:00:00Z',
            id: 'created-later-published-earlier',
            publishedAt: '2026-11-12T09:00:00Z',
          },
        ]);

        expect(await page(tx, 0, 10)).toEqual([
          'drafted-early-published-late',
          'created-later-published-earlier',
        ]);
      });
    });

    it('puts a post without publishedAt after every dated post, newest first', async () => {
      await inRolledBackTransaction(async (tx) => {
        await seed(tx, [
          { createdAt: '2026-11-18T09:00:00Z', id: 'undated-newer' },
          {
            createdAt: '2026-11-02T09:00:00Z',
            id: 'dated',
            publishedAt: '2026-11-05T09:00:00Z',
          },
          { createdAt: '2026-11-03T09:00:00Z', id: 'undated-older' },
          {
            createdAt: '2026-11-04T09:00:00Z',
            id: 'dated-by-publication-date',
            publicationDate: '2026-11-15T09:00:00Z',
          },
        ]);

        expect(await page(tx, 0, 10)).toEqual([
          'dated',
          'dated-by-publication-date',
          'undated-newer',
          'undated-older',
        ]);
      });
    });

    it('breaks a publishedAt tie by createdAt, then by id, so pages never repeat or skip a post', async () => {
      await inRolledBackTransaction(async (tx) => {
        const publishedAt = '2026-11-10T09:00:00Z';
        await seed(tx, [
          { createdAt: '2026-11-01T09:00:00Z', id: 'a', publishedAt },
          { createdAt: '2026-11-01T09:00:00Z', id: 'b', publishedAt },
          { createdAt: '2026-11-02T09:00:00Z', id: 'c', publishedAt },
          { createdAt: '2026-11-01T09:00:00Z', id: 'd', publishedAt },
        ]);

        const pages = [...(await page(tx, 0, 2)), ...(await page(tx, 2, 2))];
        expect(pages).toEqual(['c', 'd', 'b', 'a']);
      });
    });
  },
);
