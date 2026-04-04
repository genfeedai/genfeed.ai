import { PostAnalyticsEntity } from '@api/collections/posts/entities/post-analytics.entity';

describe('PostAnalyticsEntity', () => {
  it('should be defined', () => {
    expect(PostAnalyticsEntity).toBeDefined();
  });

  it('should create an instance', () => {
    const entity = new PostAnalyticsEntity();
    expect(entity).toBeInstanceOf(PostAnalyticsEntity);
  });

  // describe('properties', () => {
  //   it('should have expected properties', () => {
  //     const entity = new PostAnalyticsEntity();
  //     // Test properties
  //   });
  // });
});
