import { IngredientLineageService } from '@api/collections/ingredients/services/ingredient-lineage.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import {
  IngredientLineageDirection,
  IngredientOrigin,
} from '@genfeedai/contracts';

interface Row {
  bookmarkId: string | null;
  brandId: string | null;
  category: string;
  createdAt: Date;
  generationPrompt: string | null;
  generationSource: string | null;
  id: string;
  isDeleted: boolean;
  metadata: { label: string };
  modelUsed: string | null;
  organizationId: string;
  sourceIds: string[];
  status: string;
  updatedAt: Date;
}

type Where = Record<string, unknown>;

/**
 * A small in-memory stand-in for the slice of Prisma `where` the lineage read
 * uses: scalar equality, `{ not: null }`, `OR`, and `sources` / `sourceOf`
 * `some: { id }`. It exists so these specs assert which rows come back, not
 * just which filter object was sent.
 */
function createFakeIngredientTable(rows: Row[]) {
  const matches = (row: Row, where: Where): boolean =>
    Object.entries(where).every(([key, value]) => {
      if (key === 'OR') {
        return (value as Where[]).some((branch) => matches(row, branch));
      }
      if (key === 'sourceOf') {
        const id = (value as { some: { id: string } }).some.id;
        return (
          rows.find((other) => other.id === id)?.sourceIds.includes(row.id) ??
          false
        );
      }
      if (key === 'sources') {
        const id = (value as { some: { id: string } }).some.id;
        return row.sourceIds.includes(id);
      }
      const actual = row[key as keyof Row];
      if (value && typeof value === 'object' && 'not' in value) {
        return actual !== (value as { not: unknown }).not;
      }
      return actual === value;
    });

  return {
    count: vi.fn(
      async ({ where }: { where: Where }) =>
        rows.filter((row) => matches(row, where)).length,
    ),
    findFirst: vi.fn(
      async ({ where }: { where: Where }) =>
        rows.find((row) => matches(row, where)) ?? null,
    ),
    findMany: vi.fn(
      async ({
        skip,
        take,
        where,
      }: {
        skip: number;
        take: number;
        where: Where;
      }) =>
        rows
          .filter((row) => matches(row, where))
          .sort(
            (a, b) =>
              b.createdAt.getTime() - a.createdAt.getTime() ||
              b.id.localeCompare(a.id),
          )
          .slice(skip, skip + take),
    ),
  };
}

function row(overrides: Partial<Row> & { id: string }): Row {
  return {
    bookmarkId: null,
    brandId: 'brand-1',
    category: 'IMAGE',
    createdAt: new Date('2026-10-01T00:00:00Z'),
    generationPrompt: null,
    generationSource: null,
    isDeleted: false,
    metadata: { label: overrides.id },
    modelUsed: null,
    organizationId: 'org-1',
    sourceIds: [],
    status: 'UPLOADED',
    updatedAt: new Date('2026-10-01T00:00:00Z'),
    ...overrides,
  };
}

const viewer = { brandId: 'brand-1', organizationId: 'org-1' };

describe('IngredientLineageService', () => {
  const sheet = row({ id: 'sheet' });
  const logo = row({ id: 'logo' });
  const output = row({
    createdAt: new Date('2026-10-02T00:00:00Z'),
    generationPrompt: 'a hero shot',
    id: 'output',
    modelUsed: 'flux',
    sourceIds: ['sheet', 'logo'],
    status: 'VALIDATED',
  });

  function createService(rows: Row[]) {
    const ingredient = createFakeIngredientTable(rows);
    const service = new IngredientLineageService({ ingredient } as never);
    return { ingredient, service };
  }

  it('lists every reference an output was made from, with its origin', async () => {
    const { service } = createService([sheet, logo, output]);

    const result = await service.findLineage({
      direction: IngredientLineageDirection.MADE_FROM,
      ingredientId: 'output',
      limit: 24,
      page: 1,
      viewer,
    });

    expect(result.docs.map((doc) => doc.id).sort()).toEqual(['logo', 'sheet']);
    expect(result.totalDocs).toBe(2);
    expect(result.hiddenCount).toBe(0);
    expect(
      result.docs.every((doc) => doc.origin === IngredientOrigin.UPLOADED),
    ).toBe(true);
  });

  it('lists the outputs that used a reference, newest first', async () => {
    const older = row({
      createdAt: new Date('2026-10-01T12:00:00Z'),
      generationSource: 'studio',
      id: 'older',
      sourceIds: ['sheet'],
    });
    const { service } = createService([sheet, output, older]);

    const result = await service.findLineage({
      direction: IngredientLineageDirection.USED_IN,
      ingredientId: 'sheet',
      limit: 24,
      page: 1,
      viewer,
    });

    expect(result.docs.map((doc) => doc.id)).toEqual(['output', 'older']);
    expect(
      result.docs.every((doc) => doc.origin === IngredientOrigin.GENERATED),
    ).toBe(true);
  });

  it('counts references outside the viewer brand as hidden without naming them', async () => {
    const privateReference = row({
      brandId: 'brand-2',
      id: 'private-reference',
      metadata: { label: 'Secret client sheet' },
    });
    const { service } = createService([
      sheet,
      privateReference,
      row({ ...output, sourceIds: ['sheet', 'private-reference'] }),
    ]);

    const result = await service.findLineage({
      direction: IngredientLineageDirection.MADE_FROM,
      ingredientId: 'output',
      limit: 24,
      page: 1,
      viewer,
    });

    expect(result.docs.map((doc) => doc.id)).toEqual(['sheet']);
    expect(result.totalDocs).toBe(1);
    expect(result.hiddenCount).toBe(1);
    expect(JSON.stringify(result)).not.toContain('Secret client sheet');
    expect(JSON.stringify(result)).not.toContain('private-reference');
  });

  it('does not count another organization toward the viewer lineage', async () => {
    const foreign = row({ id: 'foreign', organizationId: 'org-2' });
    const { service } = createService([
      sheet,
      foreign,
      row({ ...output, sourceIds: ['sheet', 'foreign'] }),
    ]);

    const result = await service.findLineage({
      direction: IngredientLineageDirection.MADE_FROM,
      ingredientId: 'output',
      limit: 24,
      page: 1,
      viewer,
    });

    expect(result.docs.map((doc) => doc.id)).toEqual(['sheet']);
    expect(JSON.stringify(result)).not.toContain('foreign');
  });

  it('shows a trashed reference as a stub with no media, name or prompt', async () => {
    const trashed = row({
      generationPrompt: 'a private prompt',
      id: 'trashed',
      isDeleted: true,
      metadata: { label: 'Old sheet' },
    });
    const { service } = createService([
      trashed,
      row({ ...output, sourceIds: ['trashed'] }),
    ]);

    const result = await service.findLineage({
      direction: IngredientLineageDirection.MADE_FROM,
      ingredientId: 'output',
      limit: 24,
      page: 1,
      viewer,
    });

    expect(result.docs).toHaveLength(1);
    expect(result.docs[0]).toMatchObject({ id: 'trashed', isDeleted: true });
    expect(result.docs[0]).not.toHaveProperty('metadata');
    expect(result.docs[0]).not.toHaveProperty('generationPrompt');
    expect(JSON.stringify(result)).not.toContain('Old sheet');
    expect(JSON.stringify(result)).not.toContain('a private prompt');
  });

  it('leaves a trashed output out of "Used in"', async () => {
    const { service } = createService([
      sheet,
      row({ ...output, isDeleted: true, sourceIds: ['sheet'] }),
    ]);

    const result = await service.findLineage({
      direction: IngredientLineageDirection.USED_IN,
      ingredientId: 'sheet',
      limit: 24,
      page: 1,
      viewer,
    });

    expect(result.docs).toEqual([]);
    expect(result.totalDocs).toBe(0);
    expect(result.hiddenCount).toBe(0);
  });

  it('pages through lineage in groups of the requested size', async () => {
    const outputs = Array.from({ length: 30 }, (_, index) =>
      row({
        createdAt: new Date(Date.UTC(2026, 9, 1, 0, index)),
        id: `out-${String(index).padStart(2, '0')}`,
        sourceIds: ['sheet'],
      }),
    );
    const { service } = createService([sheet, ...outputs]);

    const first = await service.findLineage({
      direction: IngredientLineageDirection.USED_IN,
      ingredientId: 'sheet',
      limit: 24,
      page: 1,
      viewer,
    });
    const second = await service.findLineage({
      direction: IngredientLineageDirection.USED_IN,
      ingredientId: 'sheet',
      limit: 24,
      page: 2,
      viewer,
    });

    expect(first.docs).toHaveLength(24);
    expect(second.docs).toHaveLength(6);
    expect(first.totalPages).toBe(2);
    expect(first.totalDocs).toBe(30);
    expect(first.docs[0]?.id).toBe('out-29');
  });

  it.each([
    ['another organization', { ...viewer, organizationId: 'org-2' }],
    ['another brand', { ...viewer, brandId: 'brand-2' }],
  ])('returns not found for an asset in %s', async (_label, otherViewer) => {
    const { service } = createService([sheet, output]);

    await expect(
      service.findLineage({
        direction: IngredientLineageDirection.MADE_FROM,
        ingredientId: 'output',
        limit: 24,
        page: 1,
        viewer: otherViewer,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns not found for an asset that does not exist', async () => {
    const { service } = createService([sheet]);

    await expect(
      service.findLineage({
        direction: IngredientLineageDirection.USED_IN,
        ingredientId: 'missing',
        limit: 24,
        page: 1,
        viewer,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('keeps every query scoped to the viewer organization', async () => {
    const { ingredient, service } = createService([sheet, output]);

    await service.findLineage({
      direction: IngredientLineageDirection.USED_IN,
      ingredientId: 'sheet',
      limit: 24,
      page: 1,
      viewer,
    });

    const wheres = [
      ...ingredient.findFirst.mock.calls.map(([args]) => args.where),
      ...ingredient.findMany.mock.calls.map(([args]) => args.where),
      ...ingredient.count.mock.calls.map(([args]) => args.where),
    ];
    expect(wheres.length).toBeGreaterThan(0);
    for (const where of wheres) {
      expect(where).toMatchObject({ organizationId: 'org-1' });
    }
  });
});
