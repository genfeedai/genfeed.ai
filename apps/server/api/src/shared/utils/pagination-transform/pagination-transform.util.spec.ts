import {
  getDefaultPaginationOptions,
  transformPaginationFormat,
} from '@api/shared/utils/pagination-transform/pagination-transform.util';
import { ITEMS_PER_PAGE } from '@genfeedai/contracts/constants';
import { describe, expect, it } from 'vitest';

describe('pagination-transform.util', () => {
  it('maps backend pagination fields onto the frontend links contract', () => {
    expect(
      transformPaginationFormat({
        docs: [{ id: '1' }],
        hasNextPage: true,
        hasPrevPage: false,
        limit: 20,
        nextPage: 2,
        page: 1,
        pagingCounter: 1,
        prevPage: null,
        totalDocs: 21,
        totalPages: 2,
      }),
    ).toEqual({
      data: [{ id: '1' }],
      links: {
        pagination: {
          hasNext: true,
          hasPrev: false,
          limit: 20,
          next: 2,
          page: 1,
          pages: 2,
          prev: null,
          total: 21,
        },
      },
    });
  });

  it('uses ITEMS_PER_PAGE and the frontend label map by default', () => {
    expect(getDefaultPaginationOptions()).toEqual({
      customLabels: {
        docs: 'data',
        hasNextPage: 'hasNext',
        hasPrevPage: 'hasPrev',
        limit: 'limit',
        nextPage: 'next',
        page: 'page',
        prevPage: 'prev',
        totalDocs: 'total',
        totalPages: 'pages',
      },
      limit: ITEMS_PER_PAGE,
      page: 1,
      pagination: true,
    });
  });

  it('keeps caller-supplied page, limit, and custom labels', () => {
    expect(getDefaultPaginationOptions(3, 5, { docs: 'items' })).toEqual({
      customLabels: { docs: 'items' },
      limit: 5,
      page: 3,
      pagination: true,
    });
  });
});
