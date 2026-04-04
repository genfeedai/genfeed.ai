import { PostsQueryDto } from '@api/collections/posts/dto/posts-query.dto';

describe('PostsQueryDto', () => {
  it('should be defined', () => {
    expect(PostsQueryDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new PostsQueryDto();
      expect(dto).toBeInstanceOf(PostsQueryDto);
    });

    // it('should validate successfully with valid data', async () => {
    //   const dto = new PostsQueryDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
