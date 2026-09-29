import { AnalyzeToneDto } from '@api/collections/profiles/dto/analyze-tone.dto';

describe('AnalyzeToneDto', () => {
  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new AnalyzeToneDto();
      expect(dto).toBeInstanceOf(AnalyzeToneDto);
    });
  });
});
