import { OptimizeContentDto } from '@api/collections/optimizers/dto/optimize.dto';

describe('OptimizeContentDto', () => {
  it('should be defined', () => {
    expect(OptimizeContentDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new OptimizeContentDto();
      expect(dto).toBeInstanceOf(OptimizeContentDto);
    });

    // it('should validate successfully with valid data', async () => {
    //   const dto = new OptimizeDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
