import { CreateElementCameraDto } from '@api/collections/elements/cameras/dto/create-camera.dto';

describe('CreateElementCameraDto', () => {
  it('should be defined', () => {
    expect(CreateElementCameraDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new CreateElementCameraDto();
      expect(dto).toBeInstanceOf(CreateElementCameraDto);
    });
  });
});
