import { BookmarkEntity } from '@api/collections/bookmarks/entities/bookmark.entity';

describe('BookmarkEntity', () => {
  it('should be defined', () => {
    expect(BookmarkEntity).toBeDefined();
  });

  it('should create an instance', () => {
    const entity = new BookmarkEntity();
    expect(entity).toBeInstanceOf(BookmarkEntity);
  });

  // describe('properties', () => {
  //   it('should have expected properties', () => {
  //     const entity = new BookmarkEntity();
  //     // Test properties
  //   });
  // });
});
