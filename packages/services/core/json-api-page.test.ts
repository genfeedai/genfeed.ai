import { toPaginatedResponse } from '@services/core/paginated-response';
import { describe, expect, it } from 'vitest';

describe('response-owned JSON:API pagination', () => {
  it('preserves server totals that differ from the number of rows on a page', () => {
    expect(
      toPaginatedResponse([{ id: 'row-1' }], {
        data: [],
        links: { pagination: { page: 2, pages: 4, limit: 15, total: 51 } },
      }),
    ).toEqual({
      items: [{ id: 'row-1' }],
      total: 51,
      totalPages: 4,
      page: 2,
      pageSize: 15,
      hasNext: true,
      hasPrevious: true,
    });
  });

  it('keeps cursor paging semantics while retaining the rows', () => {
    expect(
      toPaginatedResponse([{ id: 'row-1' }], {
        data: [],
        links: { cursor: { hasMore: true, limit: 15, nextCursor: 'cursor-2' } },
      }),
    ).toEqual({
      items: [{ id: 'row-1' }],
      total: 1,
      totalPages: 1,
      page: 1,
      pageSize: 15,
      nextCursor: 'cursor-2',
      hasNext: true,
      hasPrevious: false,
    });
  });

  it('uses the current response for an empty collection without pagination links', () => {
    expect(toPaginatedResponse([], { data: [] })).toEqual({
      items: [],
      total: 0,
      totalPages: 1,
      page: 1,
      pageSize: 0,
      hasNext: false,
      hasPrevious: false,
    });
  });
});
