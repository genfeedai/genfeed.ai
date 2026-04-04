import { AnalyticsOverviewEntity } from '@api/collections/posts/entities/analytics-overview.entity';

describe('AnalyticsOverviewEntity', () => {
  it('should be defined', () => {
    expect(AnalyticsOverviewEntity).toBeDefined();
  });

  it('should create an instance with data', () => {
    const entity = new AnalyticsOverviewEntity({});
    expect(entity).toBeInstanceOf(AnalyticsOverviewEntity);
  });

  // describe('properties', () => {
  //   it('should have expected properties', () => {
  //     const entity = new AnalyticsOverviewEntity({});
  //     // Test properties
  //   });
  // });
});
