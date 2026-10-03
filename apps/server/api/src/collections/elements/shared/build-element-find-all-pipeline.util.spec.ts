import {
  buildElementFindAllQuery,
  DEFAULT_ELEMENT_SORT,
} from './build-element-find-all-pipeline.util';

const member = { organizationId: 'org-1' };

describe('buildElementFindAllQuery ordering', () => {
  it('sorts platform defaults before organization rows by default', () => {
    const { orderBy } = buildElementFindAllQuery({
      metadata: member,
      query: {},
    });

    // organizationId DESC puts NULL (platform defaults) first in PostgreSQL.
    expect(Object.keys(orderBy as object)).toEqual([
      'organizationId',
      'sortOrder',
      'createdAt',
      'label',
    ]);
    expect(orderBy).toEqual(DEFAULT_ELEMENT_SORT);
    expect(DEFAULT_ELEMENT_SORT.organizationId).toBe(-1);
  });

  it('keeps an explicit client sort', () => {
    const { orderBy } = buildElementFindAllQuery({
      metadata: member,
      query: { sort: 'label: 1' },
    });

    expect(orderBy).toEqual({ label: 1 });
  });

  it('keeps defaults in the first page window when an organization has 20 rows', () => {
    // Mirrors PostgreSQL: DESC orders NULLs first, then sortOrder ASC, createdAt DESC.
    const rows = [
      ...Array.from({ length: 20 }, (_, index) => ({
        createdAt: index,
        label: `A ${index}`,
        organizationId: 'org-1' as string | null,
        sortOrder: 0,
      })),
      { createdAt: 0, label: 'Photoreal', organizationId: null, sortOrder: 0 },
      { createdAt: 0, label: 'Anime', organizationId: null, sortOrder: 30 },
    ];
    const pageOne = [...rows]
      .sort(
        (left, right) =>
          Number(right.organizationId !== null) -
            Number(left.organizationId !== null) ||
          left.sortOrder - right.sortOrder ||
          right.createdAt - left.createdAt ||
          left.label.localeCompare(right.label),
      )
      .slice(0, 20);

    expect(pageOne.slice(0, 2).map((row) => row.label)).toEqual([
      'Photoreal',
      'Anime',
    ]);
  });
});
