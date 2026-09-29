import { CreateElementCameraMovementDto } from '@api/collections/elements/camera-movements/dto/create-camera-movement.dto';

describe('CreateElementCameraMovementDto', () => {
  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new CreateElementCameraMovementDto();
      expect(dto).toBeInstanceOf(CreateElementCameraMovementDto);
    });
  });
});
