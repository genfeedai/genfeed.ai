import { BookmarksQueryDto } from '@api/collections/bookmarks/dto/bookmarks-query.dto';

describe('BookmarksQueryDto', () => {
  it('should be defined', () => {
    expect(BookmarksQueryDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new BookmarksQueryDto();
      expect(dto).toBeInstanceOf(BookmarksQueryDto);
    });
  });
});
