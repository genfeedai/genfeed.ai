import { CreateBrandDto } from '@api/collections/brands/dto/create-brand.dto';

describe('CreateBrandDto', () => {
  it('should be defined', () => {
    expect(CreateBrandDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new CreateBrandDto();
      expect(dto).toBeInstanceOf(CreateBrandDto);
    });

    // it('should validate successfully with valid data', async () => {
    //   const dto = new CreateBrandDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
