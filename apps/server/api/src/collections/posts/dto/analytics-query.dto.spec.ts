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

    // it('should validate successfully with valid data', async () => {
    //   const dto = new AnalyticsQueryDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
