import { UpdateElementCameraMovementDto } from '@api/collections/elements/camera-movements/dto/update-camera-movement.dto';

describe('UpdateElementCameraMovementDto', () => {
  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new UpdateElementCameraMovementDto();
      expect(dto).toBeInstanceOf(UpdateElementCameraMovementDto);
    });
  });
});
