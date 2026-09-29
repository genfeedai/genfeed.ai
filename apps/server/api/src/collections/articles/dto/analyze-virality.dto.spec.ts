import { AnalyzeViralityDto } from '@api/collections/articles/dto/analyze-virality.dto';

describe('AnalyzeViralityDto', () => {
  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new AnalyzeViralityDto();
      expect(dto).toBeInstanceOf(AnalyzeViralityDto);
    });
  });
});
