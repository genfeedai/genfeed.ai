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

    // it('should validate successfully with valid data', async () => {
    //   const dto = new AnalyzeToneDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
