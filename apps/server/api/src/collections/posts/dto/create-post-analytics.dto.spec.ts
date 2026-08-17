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
  });
});
