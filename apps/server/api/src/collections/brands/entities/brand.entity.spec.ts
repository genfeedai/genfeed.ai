import { BrandEntity } from '@api/collections/brands/entities/brand.entity';

describe('BrandEntity', () => {
  it('should be defined', () => {
    expect(BrandEntity).toBeDefined();
  });

  it('should create an instance', () => {
    const entity = new BrandEntity();
    expect(entity).toBeInstanceOf(BrandEntity);
  });

  // describe('properties', () => {
  //   it('should have expected properties', () => {
  //     const entity = new BrandEntity();
  //     // Test properties
  //   });
  // });
});
