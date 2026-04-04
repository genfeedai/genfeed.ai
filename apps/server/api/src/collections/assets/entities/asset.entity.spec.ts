import { AssetEntity } from '@api/collections/assets/entities/asset.entity';

describe('AssetEntity', () => {
  it('should be defined', () => {
    expect(AssetEntity).toBeDefined();
  });

  it('should create an instance', () => {
    const entity = new AssetEntity();
    expect(entity).toBeInstanceOf(AssetEntity);
  });

  // describe('properties', () => {
  //   it('should have expected properties', () => {
  //     const entity = new AssetEntity();
  //     // Test properties
  //   });
  // });
});
