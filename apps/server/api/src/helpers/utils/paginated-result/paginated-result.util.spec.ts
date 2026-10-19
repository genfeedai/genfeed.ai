import { buildPaginatedResult } from '@api/helpers/utils/paginated-result/paginated-result.util';
import { describe, expect, it } from 'vitest';

describe('buildPaginatedResult', () => {
  it('describes a middle page', () => {
    expect(buildPaginatedResult(['a', 'b'], 25, 2, 10)).toEqual({
      docs: ['a', 'b'],
      hasNextPage: true,
      hasPrevPage: true,
      limit: 10,
      nextPage: 3,
      page: 2,
      pagingCounter: 11,
      prevPage: 1,
      totalDocs: 25,
      totalPages: 3,
    });
  });

  it('describes the last page', () => {
    const result = buildPaginatedResult(['x'], 21, 3, 10);
    expect(result.hasNextPage).toBe(false);
    expect(result.nextPage).toBeNull();
    expect(result.prevPage).toBe(2);
  });

  it('describes an empty result', () => {
    const result = buildPaginatedResult([], 0, 1, 20);
    expect(result.totalPages).toBe(0);
    expect(result.hasNextPage).toBe(false);
    expect(result.hasPrevPage).toBe(false);
    expect(result.pagingCounter).toBe(1);
  });
});
