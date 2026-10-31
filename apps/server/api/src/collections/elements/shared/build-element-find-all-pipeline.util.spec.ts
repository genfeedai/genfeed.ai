import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import {
  buildElementFindAllQuery,
  DEFAULT_ELEMENT_SORT,
  ELEMENT_SORT_FIELDS,
} from './build-element-find-all-pipeline.util';

const member = { organizationId: 'org-1' };

describe('buildElementFindAllQuery ordering', () => {
  it('sorts platform defaults before organization rows by default', () => {
    const { orderBy } = buildElementFindAllQuery({
      metadata: member,
      query: {} as BaseQueryDto,
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

  it.each([
    ['label: 1', { createdAt: -1, id: -1, label: 1 }],
    ['key: -1', { createdAt: -1, id: -1, key: -1 }],
    ['createdAt: 1', { createdAt: 1, id: -1 }],
    ['label: 1, password: -1', { createdAt: -1, id: -1, label: 1 }],
  ])(
    'orders by the requested column with a stable tiebreaker (%s)',
    (sort, expected) => {
      const { orderBy } = buildElementFindAllQuery({
        metadata: member,
        query: { sort } as BaseQueryDto,
      });

      expect(orderBy).toEqual(expected);
    },
  );

  it('orders by an extra column a model allows', () => {
    const { orderBy } = buildElementFindAllQuery({
      allowedSortFields: [...ELEMENT_SORT_FIELDS, 'category'],
      metadata: member,
      query: { sort: 'category: 1' } as BaseQueryDto,
    });

    expect(orderBy).toEqual({ category: 1, createdAt: -1, id: -1 });
  });

  it.each(['password: 1', 'organizationId: -1', 'category: 1', 'label'])(
    'falls back to the default order for a sort it cannot honor (%s)',
    (sort) => {
      const { orderBy } = buildElementFindAllQuery({
        metadata: member,
        query: { sort } as BaseQueryDto,
      });

      expect(orderBy).toEqual(DEFAULT_ELEMENT_SORT);
    },
  );

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
          Number(left.organizationId !== null) -
            Number(right.organizationId !== null) ||
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
