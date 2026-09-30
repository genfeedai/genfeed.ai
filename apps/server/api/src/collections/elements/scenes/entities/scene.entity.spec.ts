import { ElementSceneEntity } from '@api/collections/elements/scenes/entities/scene.entity';

describe('ElementSceneEntity', () => {
  it('should be defined', () => {
    expect(ElementSceneEntity).toBeDefined();
  });

  it('should create an instance', () => {
    const entity = new ElementSceneEntity();
    expect(entity).toBeInstanceOf(ElementSceneEntity);
  });
});
