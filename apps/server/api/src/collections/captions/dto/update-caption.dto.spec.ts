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

    // it('should validate successfully with valid data', async () => {
    //   const dto = new UpdateCaptionDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
