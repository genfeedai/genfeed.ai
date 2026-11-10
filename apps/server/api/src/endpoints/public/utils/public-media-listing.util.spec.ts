import { publicMediaOrderBy } from '@api/endpoints/public/utils/public-media-listing.util';
import { describe, expect, it } from 'vitest';

describe('publicMediaOrderBy', () => {
  it.each([
    [undefined, [{ createdAt: 'desc' }]],
    ['newest', [{ createdAt: 'desc' }]],
    ['views', [{ viewCount: 'desc' }, { createdAt: 'desc' }]],
    ['recreations', [{ recreateCount: 'desc' }, { createdAt: 'desc' }]],
    ['isDeleted', [{ createdAt: 'desc' }]],
  ])('orders %j by %j', (sortBy, expected) => {
    expect(publicMediaOrderBy(sortBy)).toEqual(expected);
  });
});
