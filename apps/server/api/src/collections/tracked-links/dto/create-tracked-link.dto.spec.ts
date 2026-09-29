import { CreateTrackedLinkDto } from '@api/collections/tracked-links/dto/create-tracked-link.dto';

describe('CreateTrackedLinkDto', () => {
  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new CreateTrackedLinkDto();
      expect(dto).toBeInstanceOf(CreateTrackedLinkDto);
    });
  });
});
