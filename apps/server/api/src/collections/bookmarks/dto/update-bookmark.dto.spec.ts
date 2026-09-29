import { UpdateBookmarkDto } from '@api/collections/bookmarks/dto/update-bookmark.dto';

describe('UpdateBookmarkDto', () => {
  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new UpdateBookmarkDto();
      expect(dto).toBeInstanceOf(UpdateBookmarkDto);
    });
  });
});
