import { GenerateVariantsDto } from '@api/collections/optimizers/dto/variants.dto';

describe('GenerateVariantsDto', () => {
  it('should be defined', () => {
    expect(GenerateVariantsDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new GenerateVariantsDto();
      expect(dto).toBeInstanceOf(GenerateVariantsDto);
    });

    // it('should validate successfully with valid data', async () => {
    //   const dto = new VariantsDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
