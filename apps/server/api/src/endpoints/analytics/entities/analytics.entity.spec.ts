import { AnalyticEntity } from '@api/endpoints/analytics/entities/analytics.entity';

describe('AnalyticEntity', () => {
  it('should be defined', () => {
    expect(new AnalyticEntity({})).toBeDefined();
  });
});
