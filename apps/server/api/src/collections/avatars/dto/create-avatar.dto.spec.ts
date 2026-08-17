import { CreateAvatarDto } from '@api/collections/avatars/dto/create-avatar.dto';

describe('CreateAvatarDto', () => {
  it('should be defined', () => {
    expect(CreateAvatarDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new CreateAvatarDto();
      expect(dto).toBeInstanceOf(CreateAvatarDto);
    });
  });
});
