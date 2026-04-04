import { ApiKeyEntity } from '@api/collections/api-keys/entities/api-key.entity';

describe('ApiKeyEntity', () => {
  it('should be defined', () => {
    expect(ApiKeyEntity).toBeDefined();
  });

  it('should create an instance', () => {
    const entity = new ApiKeyEntity();
    expect(entity).toBeInstanceOf(ApiKeyEntity);
  });

  // describe('properties', () => {
  //   it('should have expected properties', () => {
  //     const entity = new ApiKeyEntity();
  //     // Test properties
  //   });
  // });
});
