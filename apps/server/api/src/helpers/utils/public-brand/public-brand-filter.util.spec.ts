import { stripPrivateBrand } from '@api/helpers/utils/public-brand/public-brand-filter.util';

describe('stripPrivateBrand', () => {
  it('keeps the brand of a public, live profile', () => {
    const article = {
      brand: { isDeleted: false, scope: 'PUBLIC', slug: 'shayla' },
      id: 'a1',
    };

    expect(stripPrivateBrand(article)).toEqual(article);
  });

  it.each([
    ['a private brand', { isDeleted: false, scope: 'PRIVATE', slug: 'acme' }],
    ['a deleted brand', { isDeleted: true, scope: 'PUBLIC', slug: 'acme' }],
    ['no brand', null],
  ])('drops %s, so its handle never reaches the site', (_label, brand) => {
    expect(stripPrivateBrand({ brand, id: 'a1' })).toEqual({ id: 'a1' });
  });
});
