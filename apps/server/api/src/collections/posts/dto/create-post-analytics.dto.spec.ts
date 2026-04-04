import { CreatePostAnalyticsDto } from '@api/collections/posts/dto/create-post-analytics.dto';

describe('CreatePostAnalyticsDto', () => {
  it('should be defined', () => {
    expect(CreatePostAnalyticsDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new CreatePostAnalyticsDto();
      expect(dto).toBeInstanceOf(CreatePostAnalyticsDto);
    });

    // it('should validate successfully with valid data', async () => {
    //   const dto = new CreatePostAnalyticsDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
