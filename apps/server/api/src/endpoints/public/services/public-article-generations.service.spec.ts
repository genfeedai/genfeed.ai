import {
  findArticleGenerationRefs,
  PublicArticleGenerationsService,
} from '@api/endpoints/public/services/public-article-generations.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { describe, expect, it } from 'vitest';

interface IngredientRow {
  category: string;
  id: string;
  isDeleted: boolean;
  isPublic: boolean;
  metadata: null;
  organizationId: string;
  prompt: { id: string; original: string } | null;
  scope: string;
  status: string;
}

interface IngredientWhere {
  category: { in: string[] };
  id: { in: string[] };
  isDeleted: boolean;
  organizationId: string;
  OR: Array<{ isPublic?: boolean; scope?: string }>;
  status: string;
}

function ingredient(
  id: string,
  overrides: Partial<IngredientRow> = {},
): IngredientRow {
  return {
    category: 'IMAGE',
    id,
    isDeleted: false,
    isPublic: false,
    metadata: null,
    organizationId: 'org-1',
    prompt: { id: `prompt-${id}`, original: `prompt of ${id}` },
    scope: 'PUBLIC',
    status: 'GENERATED',
    ...overrides,
  };
}

/** A public article and the asset table, answering queries in memory. */
function createService(content: string | null, rows: IngredientRow[]) {
  const prisma = {
    article: {
      findFirst: async () =>
        content === null ? null : { content, organizationId: 'org-1' },
    },
    ingredient: {
      findMany: async ({ where }: { where: IngredientWhere }) =>
        rows.filter(
          (row) =>
            row.organizationId === where.organizationId &&
            row.isDeleted === where.isDeleted &&
            where.id.in.includes(row.id) &&
            where.category.in.includes(row.category) &&
            row.status === where.status &&
            where.OR.some(
              (clause) =>
                (clause.isPublic !== undefined &&
                  row.isPublic === clause.isPublic) ||
                (clause.scope !== undefined && row.scope === clause.scope),
            ),
        ),
    },
  } as unknown as PrismaService;
  return new PublicArticleGenerationsService(prisma);
}

const block = (id: string, prompt = '') =>
  `<figure data-genfeed-generation="image" data-ingredient-id="${id}"${prompt}></figure>`;

describe('findArticleGenerationRefs', () => {
  it.each([
    [block('a'), [{ ingredientId: 'a', isPromptShown: true }]],
    [
      block('a', ' data-prompt="hidden"'),
      [{ ingredientId: 'a', isPromptShown: false }],
    ],
    [
      `${block('a')}<p>x</p>${block('a', ' data-prompt="hidden"')}`,
      [{ ingredientId: 'a', isPromptShown: false }],
    ],
    ['<figure data-ingredient-id="a"></figure>', []],
    [
      '<figure data-genfeed-generation="audio" data-ingredient-id="a"></figure>',
      [],
    ],
    ['<p>No blocks</p>', []],
  ])('%s', (content, expected) => {
    expect(findArticleGenerationRefs(content)).toEqual(expected);
  });
});

describe('PublicArticleGenerationsService', () => {
  it('returns the embedded generations in reading order', async () => {
    const service = createService(`${block('b')}${block('a')}`, [
      ingredient('a'),
      ingredient('b'),
    ]);

    const generations = await service.findForArticle('article-1', {});

    expect(generations.map((item) => item.id)).toEqual(['b', 'a']);
  });

  it('leaves out a prompt the author hid', async () => {
    const service = createService(block('a', ' data-prompt="hidden"'), [
      ingredient('a'),
    ]);

    const [generation] = await service.findForArticle('article-1', {});

    expect(generation?.prompt).toBeNull();
  });

  it.each([
    ['private', ingredient('a', { scope: 'USER' })],
    ['from another organization', ingredient('a', { organizationId: 'org-2' })],
    ['still processing', ingredient('a', { status: 'PROCESSING' })],
    ['deleted', ingredient('a', { isDeleted: true })],
  ])('never returns an asset that is %s', async (_label, row) => {
    const service = createService(block('a'), [row]);

    await expect(service.findForArticle('article-1', {})).resolves.toEqual([]);
  });

  it('returns an asset shared publicly by its own flag', async () => {
    const service = createService(block('a'), [
      ingredient('a', { isPublic: true, scope: 'USER' }),
    ]);

    await expect(service.findForArticle('article-1', {})).resolves.toHaveLength(
      1,
    );
  });

  it('returns nothing for an article that is not public', async () => {
    const service = createService(null, [ingredient('a')]);

    await expect(service.findForArticle('article-1', {})).resolves.toEqual([]);
  });
});
