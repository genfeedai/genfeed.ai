import { ImageEditDto } from '@api/collections/images/dto/image-edit.dto';

describe('ImageEditDto', () => {
  it('should be defined', () => {
    expect(ImageEditDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new ImageEditDto();
      expect(dto).toBeInstanceOf(ImageEditDto);
    });

    // it('should validate successfully with valid data', async () => {
    //   const dto = new ImageEditDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
