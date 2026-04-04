import { AnalyzeContentDto } from '@api/collections/optimizers/dto/analyze.dto';

describe('AnalyzeContentDto', () => {
  it('should be defined', () => {
    expect(AnalyzeContentDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new AnalyzeContentDto();
      expect(dto).toBeInstanceOf(AnalyzeContentDto);
    });

    // it('should validate successfully with valid data', async () => {
    //   const dto = new AnalyzeDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
