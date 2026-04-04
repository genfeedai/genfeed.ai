import { UpdateElementCameraMovementDto } from '@api/collections/elements/camera-movements/dto/update-camera-movement.dto';

describe('UpdateElementCameraMovementDto', () => {
  it('should be defined', () => {
    expect(UpdateElementCameraMovementDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new UpdateElementCameraMovementDto();
      expect(dto).toBeInstanceOf(UpdateElementCameraMovementDto);
    });
  });
});
