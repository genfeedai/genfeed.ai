import { CreateElementStyleDto } from '@api/collections/elements/styles/dto/create-style.dto';

describe('CreateElementStyleDto', () => {
  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new CreateElementStyleDto();
      expect(dto).toBeInstanceOf(CreateElementStyleDto);
    });
  });
});
