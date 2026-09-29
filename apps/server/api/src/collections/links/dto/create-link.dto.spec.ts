import { CreateLinkDto } from '@api/collections/links/dto/create-link.dto';

describe('CreateLinkDto', () => {
  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new CreateLinkDto();
      expect(dto).toBeInstanceOf(CreateLinkDto);
    });
  });
});
