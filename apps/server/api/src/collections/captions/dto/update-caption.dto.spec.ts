import { UpdateCaptionDto } from '@api/collections/captions/dto/update-caption.dto';

describe('UpdateCaptionDto', () => {
  it('should be defined', () => {
    expect(UpdateCaptionDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new UpdateCaptionDto();
      expect(dto).toBeInstanceOf(UpdateCaptionDto);
    });
  });
});
