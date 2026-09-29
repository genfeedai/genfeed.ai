import { UpdateElementCameraDto } from '@api/collections/elements/cameras/dto/update-camera.dto';

describe('UpdateElementCameraDto', () => {
  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new UpdateElementCameraDto();
      expect(dto).toBeInstanceOf(UpdateElementCameraDto);
    });
  });
});
