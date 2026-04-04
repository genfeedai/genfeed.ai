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

    // it('should validate successfully with valid data', async () => {
    //   const dto = new UpdateBookmarkDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
