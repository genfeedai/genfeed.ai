import { UpdateBookmarkDto } from '@api/collections/bookmarks/dto/update-bookmark.dto';

describe('UpdateBookmarkDto', () => {
  it('should be defined', () => {
    expect(UpdateBookmarkDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new UpdateBookmarkDto();
      expect(dto).toBeInstanceOf(UpdateBookmarkDto);
    });
  });
});
