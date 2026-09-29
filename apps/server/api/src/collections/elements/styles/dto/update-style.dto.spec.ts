import { UpdateElementStyleDto } from '@api/collections/elements/styles/dto/update-style.dto';

describe('UpdateElementStyleDto', () => {
  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new UpdateElementStyleDto();
      expect(dto).toBeInstanceOf(UpdateElementStyleDto);
    });
  });
});
