import { ContentType, PostCategory } from '@genfeedai/enums';
import { mapPostCategoryToContentType } from './content-performance-category.util';

describe('mapPostCategoryToContentType', () => {
  it.each([
    [PostCategory.ARTICLE, ContentType.ARTICLE],
    [PostCategory.IMAGE, ContentType.IMAGE],
    [PostCategory.POST, ContentType.CAPTION],
    [PostCategory.REEL, ContentType.VIDEO],
    [PostCategory.STORY, ContentType.IMAGE],
    [PostCategory.TEXT, ContentType.CAPTION],
    [PostCategory.VIDEO, ContentType.VIDEO],
  ])('maps %s to %s', (category, expected) => {
    expect(mapPostCategoryToContentType(category)).toBe(expected);
  });

  it.each([[undefined], [null], ['']])(
    'falls back to CAPTION for the empty value %s',
    (category) => {
      expect(mapPostCategoryToContentType(category)).toBe(ContentType.CAPTION);
    },
  );

  it('falls back to CAPTION for an unknown category', () => {
    expect(mapPostCategoryToContentType('carousel-experiment')).toBe(
      ContentType.CAPTION,
    );
  });
});
