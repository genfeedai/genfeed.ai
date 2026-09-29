import { UpdateImageDto } from '@api/collections/images/dto/update-image.dto';

describe('UpdateImageDto', () => {
  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new UpdateImageDto();
      expect(dto).toBeInstanceOf(UpdateImageDto);
    });
  });
});
