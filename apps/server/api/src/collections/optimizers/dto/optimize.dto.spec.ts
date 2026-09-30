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
  });
});
