import { AnalyzeToneDto } from '@api/collections/profiles/dto/analyze-tone.dto';

describe('AnalyzeToneDto', () => {
  it('should be defined', () => {
    expect(AnalyzeToneDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new AnalyzeToneDto();
      expect(dto).toBeInstanceOf(AnalyzeToneDto);
    });
  });
});
