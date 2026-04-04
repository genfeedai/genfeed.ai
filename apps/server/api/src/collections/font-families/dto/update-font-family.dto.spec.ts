import { UpdateFontFamilyDto } from '@api/collections/font-families/dto/update-font-family.dto';

describe('UpdateFontFamilyDto', () => {
  it('should be defined', () => {
    expect(UpdateFontFamilyDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new UpdateFontFamilyDto();
      expect(dto).toBeInstanceOf(UpdateFontFamilyDto);
    });

    // it('should validate successfully with valid data', async () => {
    //   const dto = new UpdateFontFamilyDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
