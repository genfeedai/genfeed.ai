import { AnalyzeContentDto } from '@api/collections/optimizers/dto/analyze.dto';

describe('AnalyzeContentDto', () => {
  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new AnalyzeContentDto();
      expect(dto).toBeInstanceOf(AnalyzeContentDto);
    });
  });
});
