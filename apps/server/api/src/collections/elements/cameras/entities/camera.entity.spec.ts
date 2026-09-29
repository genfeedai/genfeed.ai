import { ElementCameraEntity } from '@api/collections/elements/cameras/entities/camera.entity';

describe('ElementCameraEntity', () => {
  it('should create an instance', () => {
    const entity = new ElementCameraEntity();
    expect(entity).toBeInstanceOf(ElementCameraEntity);
  });
});
