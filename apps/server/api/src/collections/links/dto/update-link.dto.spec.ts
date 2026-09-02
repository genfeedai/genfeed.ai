import { UpdateLinkDto } from '@api/collections/links/dto/update-link.dto';

describe('UpdateLinkDto', () => {
  it('should be defined', () => {
    expect(UpdateLinkDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new UpdateLinkDto();
      expect(dto).toBeInstanceOf(UpdateLinkDto);
    });
  });
});
