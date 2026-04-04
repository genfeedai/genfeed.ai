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

    // it('should validate successfully with valid data', async () => {
    //   const dto = new BookmarksQueryDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
