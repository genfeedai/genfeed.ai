import {
  publicMediaListing,
  publicMediaOrderBy,
} from '@api/endpoints/public/utils/public-media-listing.util';
import { AssetScope } from '@genfeedai/contracts';
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

describe('publicMediaListing', () => {
  it('keeps only work from live public creators and names each creator', () => {
    expect(publicMediaListing('true')).toEqual({
      include: {
        brand: { select: { id: true, slug: true } },
        metadata: {
          select: {
            duration: true,
            height: true,
            id: true,
            label: true,
            model: true,
            width: true,
          },
        },
      },
      where: {
        brand: { is: { isDeleted: false, scope: AssetScope.PUBLIC } },
      },
    });
  });

  it.each([[undefined], ['false'], ['1']])(
    'adds no creator filter or handle for %j',
    (flag) => {
      const listing = publicMediaListing(flag);
      expect(listing.where).toEqual({});
      expect(listing.include).toEqual({
        metadata: {
          select: {
            duration: true,
            height: true,
            id: true,
            label: true,
            model: true,
            width: true,
          },
        },
      });
    },
  );
});
