import { BrandEntity } from '@api/collections/brands/entities/brand.entity';

describe('BrandEntity', () => {
  it('should create an instance', () => {
    const entity = new BrandEntity();
    expect(entity).toBeInstanceOf(BrandEntity);
  });
});
