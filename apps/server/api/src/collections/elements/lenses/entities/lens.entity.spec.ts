import { ElementLensEntity } from '@api/collections/elements/lenses/entities/lens.entity';

describe('ElementLensEntity', () => {
  it('should create an instance', () => {
    const entity = new ElementLensEntity();
    expect(entity).toBeInstanceOf(ElementLensEntity);
  });
});
