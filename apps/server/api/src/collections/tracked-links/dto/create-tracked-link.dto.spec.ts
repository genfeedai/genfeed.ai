import { CreateTrackedLinkDto } from '@api/collections/tracked-links/dto/create-tracked-link.dto';

describe('CreateTrackedLinkDto', () => {
  it('should be defined', () => {
    expect(CreateTrackedLinkDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new CreateTrackedLinkDto();
      expect(dto).toBeInstanceOf(CreateTrackedLinkDto);
    });
  });
});
