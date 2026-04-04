import { ElementCameraEntity } from '@api/collections/elements/cameras/entities/camera.entity';

describe('ElementCameraEntity', () => {
  it('should be defined', () => {
    expect(ElementCameraEntity).toBeDefined();
  });

  it('should create an instance', () => {
    const entity = new ElementCameraEntity();
    expect(entity).toBeInstanceOf(ElementCameraEntity);
  });
});
