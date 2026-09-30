import { ElementLightingEntity } from '@api/collections/elements/lightings/entities/lighting.entity';

describe('ElementLightingEntity', () => {
  it('should be defined', () => {
    expect(ElementLightingEntity).toBeDefined();
  });

  it('should create an instance', () => {
    const entity = new ElementLightingEntity();
    expect(entity).toBeInstanceOf(ElementLightingEntity);
  });
});
