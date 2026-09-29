import { UpdateCaptionDto } from '@api/collections/captions/dto/update-caption.dto';

describe('UpdateCaptionDto', () => {
  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new UpdateCaptionDto();
      expect(dto).toBeInstanceOf(UpdateCaptionDto);
    });
  });
});
