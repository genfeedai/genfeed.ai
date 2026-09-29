import { UpdateAvatarDto } from '@api/collections/avatars/dto/update-avatar.dto';

describe('UpdateAvatarDto', () => {
  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new UpdateAvatarDto();
      expect(dto).toBeInstanceOf(UpdateAvatarDto);
    });
  });
});
