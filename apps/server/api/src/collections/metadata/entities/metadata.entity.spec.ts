import { UserEntity } from '@api/collections/users/entities/user.entity';

describe('UserEntity', () => {
  it('should be defined', () => {
    expect(new UserEntity({})).toBeDefined();
  });
});
