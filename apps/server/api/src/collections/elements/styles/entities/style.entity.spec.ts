import { ElementStyleEntity } from '@api/collections/elements/styles/entities/style.entity';

describe('ElementStyleEntity', () => {
  it('should create an instance', () => {
    const entity = new ElementStyleEntity();
    expect(entity).toBeInstanceOf(ElementStyleEntity);
  });
});
