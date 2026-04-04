import { RoleEntity } from '@api/collections/roles/entities/role.entity';

describe('RoleEntity', () => {
  it('should be defined', () => {
    expect(RoleEntity).toBeDefined();
  });

  it('should create an instance', () => {
    const entity = new RoleEntity();
    expect(entity).toBeInstanceOf(RoleEntity);
  });

  // describe('properties', () => {
  //   it('should have expected properties', () => {
  //     const entity = new RoleEntity();
  //     // Test properties
  //   });
  // });
});
