import { UpdateElementCameraDto } from '@api/collections/elements/cameras/dto/update-camera.dto';

describe('UpdateElementCameraDto', () => {
  it('should be defined', () => {
    expect(UpdateElementCameraDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new UpdateElementCameraDto();
      expect(dto).toBeInstanceOf(UpdateElementCameraDto);
    });
  });
});
