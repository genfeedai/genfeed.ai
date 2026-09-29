import { BookmarkEntity } from '@api/collections/bookmarks/entities/bookmark.entity';

describe('BookmarkEntity', () => {
  it('should create an instance', () => {
    const entity = new BookmarkEntity();
    expect(entity).toBeInstanceOf(BookmarkEntity);
  });
});
