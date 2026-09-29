import { OptimizeContentDto } from '@api/collections/optimizers/dto/optimize.dto';

describe('OptimizeContentDto', () => {
  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new OptimizeContentDto();
      expect(dto).toBeInstanceOf(OptimizeContentDto);
    });
  });
});
