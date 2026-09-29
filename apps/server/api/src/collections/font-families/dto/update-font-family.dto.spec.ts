import { UpdateFontFamilyDto } from '@api/collections/font-families/dto/update-font-family.dto';

describe('UpdateFontFamilyDto', () => {
  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new UpdateFontFamilyDto();
      expect(dto).toBeInstanceOf(UpdateFontFamilyDto);
    });
  });
});
