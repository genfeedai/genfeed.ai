import { ElementLensEntity } from '@api/collections/elements/lenses/entities/lens.entity';

describe('ElementLensEntity', () => {
  it('should be defined', () => {
    expect(ElementLensEntity).toBeDefined();
  });

  it('should create an instance', () => {
    const entity = new ElementLensEntity();
    expect(entity).toBeInstanceOf(ElementLensEntity);
  });
});
