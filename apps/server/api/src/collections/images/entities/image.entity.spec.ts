import { ImageEntity } from '@api/collections/images/entities/image.entity';

describe('ImageEntity', () => {
  it('should be defined', () => {
    expect(ImageEntity).toBeDefined();
  });

  it('should create an instance', () => {
    const entity = new ImageEntity();
    expect(entity).toBeInstanceOf(ImageEntity);
  });

  // describe('properties', () => {
  //   it('should have expected properties', () => {
  //     const entity = new ImageEntity();
  //     // Test properties
  //   });
  // });
});
