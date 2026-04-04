import { UpdatePostDto } from '@api/collections/posts/dto/update-post.dto';

describe('UpdatePostDto', () => {
  it('should be defined', () => {
    expect(UpdatePostDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new UpdatePostDto();
      expect(dto).toBeInstanceOf(UpdatePostDto);
    });

    // it('should validate successfully with valid data', async () => {
    //   const dto = new UpdatePostDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
