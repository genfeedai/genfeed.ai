import { RoleEntity } from '@api/collections/roles/entities/role.entity';

describe('RoleEntity', () => {
  it('should create an instance', () => {
    const entity = new RoleEntity();
    expect(entity).toBeInstanceOf(RoleEntity);
  });
});
