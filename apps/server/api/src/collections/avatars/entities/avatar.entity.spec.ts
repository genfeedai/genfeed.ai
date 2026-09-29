import { AvatarEntity } from '@api/collections/avatars/entities/avatar.entity';

describe('AvatarEntity', () => {
  it('should create an instance', () => {
    const entity = new AvatarEntity();
    expect(entity).toBeInstanceOf(AvatarEntity);
  });
});
