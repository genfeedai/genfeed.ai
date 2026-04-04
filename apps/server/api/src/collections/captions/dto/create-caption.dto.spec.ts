import { CreateCaptionDto } from '@api/collections/captions/dto/create-caption.dto';

describe('CreateCaptionDto', () => {
  it('should be defined', () => {
    expect(CreateCaptionDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new CreateCaptionDto();
      expect(dto).toBeInstanceOf(CreateCaptionDto);
    });

    // it('should validate successfully with valid data', async () => {
    //   const dto = new CreateCaptionDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
