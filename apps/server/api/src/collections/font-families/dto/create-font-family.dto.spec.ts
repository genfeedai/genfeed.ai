import { CreateFontFamilyDto } from '@api/collections/font-families/dto/create-font-family.dto';

describe('CreateFontFamilyDto', () => {
  it('should be defined', () => {
    expect(CreateFontFamilyDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new CreateFontFamilyDto();
      expect(dto).toBeInstanceOf(CreateFontFamilyDto);
    });

    // it('should validate successfully with valid data', async () => {
    //   const dto = new CreateFontFamilyDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
