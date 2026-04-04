import { AnalyticsTimeSeriesEntity } from '@api/collections/posts/entities/analytics-timeseries.entity';

describe('AnalyticsTimeSeriesEntity', () => {
  it('should be defined', () => {
    expect(AnalyticsTimeSeriesEntity).toBeDefined();
  });

  it('should create an instance with empty array', () => {
    const entity = new AnalyticsTimeSeriesEntity([]);
    expect(entity).toBeInstanceOf(AnalyticsTimeSeriesEntity);
  });

  // describe('properties', () => {
  //   it('should have expected properties', () => {
  //     const entity = new AnalyticsTimeSeriesEntity([]);
  //     // Test properties
  //   });
  // });
});
