import { BrandQueryDto } from '@api/collections/brands/dto/brand-query.dto';

describe('BrandQueryDto', () => {
  it('should be defined', () => {
    expect(BrandQueryDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new BrandQueryDto();
      expect(dto).toBeInstanceOf(BrandQueryDto);
    });
  });
});
