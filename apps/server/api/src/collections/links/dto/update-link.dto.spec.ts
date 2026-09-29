import { UpdateLinkDto } from '@api/collections/links/dto/update-link.dto';

describe('UpdateLinkDto', () => {
  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new UpdateLinkDto();
      expect(dto).toBeInstanceOf(UpdateLinkDto);
    });
  });
});
