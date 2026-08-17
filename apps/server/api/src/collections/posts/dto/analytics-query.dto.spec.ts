import { AnalyticsQueryDto } from '@api/collections/posts/dto/analytics-query.dto';

describe('AnalyticsQueryDto', () => {
  it('should be defined', () => {
    expect(AnalyticsQueryDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new AnalyticsQueryDto();
      expect(dto).toBeInstanceOf(AnalyticsQueryDto);
    });
  });
});
