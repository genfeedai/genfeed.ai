import { BaseEntity } from '@api/shared/entities/base/base.entity';

class TestBaseEntity extends BaseEntity {}

describe('BaseEntity', () => {
  it('should be defined', () => {
    expect(BaseEntity).toBeDefined();
  });

  it('should create an instance', () => {
    const entity = new TestBaseEntity({});
    expect(entity).toBeInstanceOf(BaseEntity);
  });

  // describe('properties', () => {
  //   it('should have expected properties', () => {
  //     const entity = new BaseEntity();
  //     // Test properties
  //   });
  // });
});
