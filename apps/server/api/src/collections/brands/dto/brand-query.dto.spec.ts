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

    // it('should validate successfully with valid data', async () => {
    //   const dto = new BrandQueryDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
