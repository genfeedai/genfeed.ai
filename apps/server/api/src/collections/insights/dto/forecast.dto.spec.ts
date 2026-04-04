import { GetForecastDto } from '@api/collections/insights/dto/forecast.dto';

describe('GetForecastDto', () => {
  it('should be defined', () => {
    expect(GetForecastDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new GetForecastDto();
      expect(dto).toBeInstanceOf(GetForecastDto);
    });

    // it('should validate successfully with valid data', async () => {
    //   const dto = new ForecastDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
