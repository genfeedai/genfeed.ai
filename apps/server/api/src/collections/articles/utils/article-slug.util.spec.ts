import {
  isPublicSlugUniqueViolation,
  PUBLIC_ARTICLE_SLUG_INDEX,
} from '@api/collections/articles/utils/article-slug.util';

describe('isPublicSlugUniqueViolation', () => {
  it.each([
    [{ code: 'P2002', meta: { target: ['slug'] } }],
    [{ code: 'P2002', meta: { target: PUBLIC_ARTICLE_SLUG_INDEX } }],
    [{ code: 'P2002', meta: { target: [PUBLIC_ARTICLE_SLUG_INDEX] } }],
  ])('recognizes %j', (error) => {
    expect(isPublicSlugUniqueViolation(error)).toBe(true);
  });

  it.each([
    [{ code: 'P2002', meta: { target: ['email'] } }],
    [{ code: 'P2025', meta: { target: ['slug'] } }],
    [{ code: 'P2002' }],
    [new Error('boom')],
    [null],
    ['P2002'],
  ])('ignores %j', (error) => {
    expect(isPublicSlugUniqueViolation(error)).toBe(false);
  });
});
