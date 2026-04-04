import { CreateElementCameraMovementDto } from '@api/collections/elements/camera-movements/dto/create-camera-movement.dto';

describe('CreateElementCameraMovementDto', () => {
  it('should be defined', () => {
    expect(CreateElementCameraMovementDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new CreateElementCameraMovementDto();
      expect(dto).toBeInstanceOf(CreateElementCameraMovementDto);
    });
  });
});
