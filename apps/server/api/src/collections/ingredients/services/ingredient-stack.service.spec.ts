import { IngredientStackService } from '@api/collections/ingredients/services/ingredient-stack.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';

interface LinkRow {
  ingredientId: string;
  position: number;
  postId: string;
}

interface LinkWhere {
  ingredientId?: string | { in: string[] };
  position?: number;
  postId?: string | { in: string[] };
}

const ORG = 'org-1';

/** Three-slide carousel `post-1` (a, b, c) and a single-image post `post-2` (d). */
const LINKS: LinkRow[] = [
  { ingredientId: 'a', position: 0, postId: 'post-1' },
  { ingredientId: 'b', position: 1, postId: 'post-1' },
  { ingredientId: 'c', position: 2, postId: 'post-1' },
  { ingredientId: 'd', position: 0, postId: 'post-2' },
];

function matches(value: string, filter?: string | { in: string[] }): boolean {
  if (filter === undefined) {
    return true;
  }
  return typeof filter === 'string' ? value === filter : filter.in.includes(value);
}

function rowsFor(where: LinkWhere): LinkRow[] {
  return LINKS.filter(
    (row) =>
      matches(row.ingredientId, where.ingredientId) &&
      matches(row.postId, where.postId) &&
      (where.position === undefined || row.position === where.position),
  );
}

function createService(): IngredientStackService {
  const prisma = {
    postIngredient: {
      findMany: async ({
        orderBy,
        where,
      }: {
        orderBy?: { position?: 'asc' };
        where: LinkWhere;
      }) => {
        const rows = rowsFor(where);
        return orderBy?.position
          ? [...rows].sort((left, right) => left.position - right.position)
          : rows;
      },
      groupBy: async ({ where }: { where: LinkWhere }) => {
        const counts = new Map<string, number>();
        for (const row of rowsFor(where)) {
          counts.set(row.postId, (counts.get(row.postId) ?? 0) + 1);
        }
        return [...counts].map(([postId, total]) => ({
          _count: { _all: total },
          postId,
        }));
      },
    },
  } as unknown as PrismaService;
  return new IngredientStackService(prisma);
}

describe('IngredientStackService', () => {
  it('gives the cover of a carousel its slide count and leaves single images loose', async () => {
    const page = await createService().attachToPage(
      { docs: [{ id: 'a' }, { id: 'd' }, { id: 'z' }] },
      ORG,
    );

    expect(page.docs).toEqual([
      { id: 'a', stack: { count: 3, postId: 'post-1' } },
      { id: 'd', stack: null },
      { id: 'z', stack: null },
    ]);
  });

  it('returns no stacks without an organization', async () => {
    const stacks = await createService().summarize(undefined, ['a']);

    expect([...stacks]).toEqual([]);
  });

  it('lists the slides of a carousel in order from any slide of it', async () => {
    const slides = await createService().findSlideIds(ORG, 'c');

    expect(slides).toEqual(['a', 'b', 'c']);
  });

  it('returns no slides for an asset in a single-image post', async () => {
    const slides = await createService().findSlideIds(ORG, 'd');

    expect(slides).toEqual([]);
  });

  it('adds no list filter unless stacking is asked for', () => {
    const service = createService();

    expect(service.buildFilter(undefined)).toEqual({});
    expect(service.buildFilter(true)).toEqual({
      postLinks: {
        none: { position: { gt: 0 }, post: { isDeleted: false } },
      },
    });
  });
});
