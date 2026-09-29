import { GenerateVariantsDto } from '@api/collections/optimizers/dto/variants.dto';

describe('GenerateVariantsDto', () => {
  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new GenerateVariantsDto();
      expect(dto).toBeInstanceOf(GenerateVariantsDto);
    });
  });
});
