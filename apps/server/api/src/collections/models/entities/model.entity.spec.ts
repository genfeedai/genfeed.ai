import { ModelEntity } from '@api/collections/models/entities/model.entity';

describe('ModelEntity', () => {
  it('should be defined', () => {
    expect(ModelEntity).toBeDefined();
  });

  it('should create an instance', () => {
    const entity = new ModelEntity();
    expect(entity).toBeInstanceOf(ModelEntity);
  });

  // describe('properties', () => {
  //   it('should have expected properties', () => {
  //     const entity = new ModelEntity();
  //     // Test properties
  //   });
  // });
});
