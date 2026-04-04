import { ElementStyleEntity } from '@api/collections/elements/styles/entities/style.entity';

describe('ElementStyleEntity', () => {
  it('should be defined', () => {
    expect(ElementStyleEntity).toBeDefined();
  });

  it('should create an instance', () => {
    const entity = new ElementStyleEntity();
    expect(entity).toBeInstanceOf(ElementStyleEntity);
  });
});
