import { CreatePostDto } from '@api/collections/posts/dto/create-post.dto';

describe('CreatePostDto', () => {
  it('should be defined', () => {
    expect(CreatePostDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new CreatePostDto();
      expect(dto).toBeInstanceOf(CreatePostDto);
    });

    // it('should validate successfully with valid data', async () => {
    //   const dto = new CreatePostDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
