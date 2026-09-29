import { CreateElementCameraDto } from '@api/collections/elements/cameras/dto/create-camera.dto';

describe('CreateElementCameraDto', () => {
  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new CreateElementCameraDto();
      expect(dto).toBeInstanceOf(CreateElementCameraDto);
    });
  });
});
