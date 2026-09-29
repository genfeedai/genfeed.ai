import { PredictViralDto } from '@api/collections/insights/dto/predict-viral.dto';

describe('PredictViralDto', () => {
  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new PredictViralDto();
      expect(dto).toBeInstanceOf(PredictViralDto);
    });
  });
});
