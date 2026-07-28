import { ContentType, PostCategory } from '@genfeedai/enums';
import { describe, expect, it } from 'vitest';

import { mapPostCategoryToContentType } from './content-performance-category.util';

describe('mapPostCategoryToContentType', () => {
  it.each([
    [PostCategory.VIDEO, ContentType.VIDEO],
    [PostCategory.REEL, ContentType.VIDEO],
    [PostCategory.IMAGE, ContentType.IMAGE],
    [PostCategory.STORY, ContentType.IMAGE],
    [PostCategory.ARTICLE, ContentType.ARTICLE],
    [PostCategory.TEXT, ContentType.CAPTION],
    [PostCategory.POST, ContentType.CAPTION],
  ])('maps %s to %s', (category, contentType) => {
    expect(mapPostCategoryToContentType(category)).toBe(contentType);
  });

  it.each([
    undefined,
    null,
    '',
    'unknown-category',
  ])('defaults %p to caption', (category) => {
    expect(mapPostCategoryToContentType(category)).toBe(ContentType.CAPTION);
  });
});
