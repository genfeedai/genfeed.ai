import { CreateBookmarkDto } from '@api/collections/bookmarks/dto/create-bookmark.dto';

describe('CreateBookmarkDto', () => {
  it('should be defined', () => {
    expect(CreateBookmarkDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new CreateBookmarkDto();
      expect(dto).toBeInstanceOf(CreateBookmarkDto);
    });

    // it('should validate successfully with valid data', async () => {
    //   const dto = new CreateBookmarkDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
