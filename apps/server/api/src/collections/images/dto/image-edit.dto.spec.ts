import { ImageEditDto } from '@api/collections/images/dto/image-edit.dto';

describe('ImageEditDto', () => {
  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new ImageEditDto();
      expect(dto).toBeInstanceOf(ImageEditDto);
    });
  });
});
