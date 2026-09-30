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
  });
});
