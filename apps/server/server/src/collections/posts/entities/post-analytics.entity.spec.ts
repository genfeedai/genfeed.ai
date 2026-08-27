import { PostAnalyticsEntity } from '@server/collections/posts/entities/post-analytics.entity';

describe('PostAnalyticsEntity', () => {
  it('should be defined', () => {
    expect(PostAnalyticsEntity).toBeDefined();
  });

  it('should create an instance', () => {
    const entity = new PostAnalyticsEntity();
    expect(entity).toBeInstanceOf(PostAnalyticsEntity);
  });
});
