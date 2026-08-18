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
  });
});
