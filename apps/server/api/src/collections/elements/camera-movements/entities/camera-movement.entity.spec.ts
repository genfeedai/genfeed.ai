import { ElementCameraMovementEntity } from '@api/collections/elements/camera-movements/entities/camera-movement.entity';

describe('ElementCameraMovementEntity', () => {
  it('should create an instance', () => {
    const entity = new ElementCameraMovementEntity();
    expect(entity).toBeInstanceOf(ElementCameraMovementEntity);
  });
});
