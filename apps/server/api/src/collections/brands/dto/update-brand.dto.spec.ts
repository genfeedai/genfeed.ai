import { UpdateBrandDto } from '@api/collections/brands/dto/update-brand.dto';

describe('UpdateBrandDto', () => {
  it('should be defined', () => {
    expect(UpdateBrandDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new UpdateBrandDto();
      expect(dto).toBeInstanceOf(UpdateBrandDto);
    });

    // it('should validate successfully with valid data', async () => {
    //   const dto = new UpdateBrandDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
