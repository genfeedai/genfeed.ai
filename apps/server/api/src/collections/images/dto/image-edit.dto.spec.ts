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
  });
});
