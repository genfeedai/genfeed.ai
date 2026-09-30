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
  });
});
