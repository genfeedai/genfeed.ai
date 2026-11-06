import {
  brandRestrictionWhere,
  collectRequestedBrandIds,
} from '@api/helpers/utils/auth/api-key-brand-restriction.util';

const BRAND_A = 'cm0brandaaaaaaaaaaaaaaaa1';
const BRAND_B = 'cm0brandbbbbbbbbbbbbbbbb1';

describe('collectRequestedBrandIds', () => {
  it.each([
    [
      'a brandId path param',
      { params: { brandId: BRAND_A }, route: { path: '/brands/:brandId' } },
      [BRAND_A],
    ],
    [
      'the id of a brands/:id route',
      {
        params: { id: BRAND_A },
        route: { path: '/v1/brands/:id/agent-config' },
      },
      [BRAND_A],
    ],
    [
      'the id of a route that is not a brand',
      { params: { id: BRAND_A }, route: { path: '/images/:id' } },
      [],
    ],
    [
      'comma-separated query ids',
      { query: { brandIds: `${BRAND_A},${BRAND_B}` } },
      [BRAND_A, BRAND_B],
    ],
    [
      'a body brand and brand list',
      { body: { brand: BRAND_A, brandIds: [BRAND_B] } },
      [BRAND_B, BRAND_A],
    ],
    ['a slug, which is not a brand id', { query: { brand: 'my-brand' } }, []],
    ['a body that is not an object', { body: [BRAND_A] }, []],
  ])('reads %s', (_case, request, expected) => {
    expect(collectRequestedBrandIds(request)).toEqual(expected);
  });
});

describe('brand restriction for a caller', () => {
  it.each([
    [
      'a restricted key',
      { allowedBrandIds: [BRAND_A] },
      { brandId: { in: [BRAND_A] } },
    ],
    ['any other caller', {}, {}],
  ])('narrows rows for %s', (_case, caller, expected) => {
    expect(brandRestrictionWhere(caller)).toEqual(expected);
  });
});
