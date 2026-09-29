import { CreateBookmarkDto } from '@api/collections/bookmarks/dto/create-bookmark.dto';

describe('CreateBookmarkDto', () => {
  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new CreateBookmarkDto();
      expect(dto).toBeInstanceOf(CreateBookmarkDto);
    });
  });
});
