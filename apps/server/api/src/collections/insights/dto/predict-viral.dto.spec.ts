import { PredictViralDto } from '@api/collections/insights/dto/predict-viral.dto';

describe('PredictViralDto', () => {
  it('should be defined', () => {
    expect(PredictViralDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new PredictViralDto();
      expect(dto).toBeInstanceOf(PredictViralDto);
    });

    // it('should validate successfully with valid data', async () => {
    //   const dto = new PredictViralDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
