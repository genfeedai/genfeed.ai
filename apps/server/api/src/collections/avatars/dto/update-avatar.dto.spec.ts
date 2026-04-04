import { UpdateAvatarDto } from '@api/collections/avatars/dto/update-avatar.dto';

describe('UpdateAvatarDto', () => {
  it('should be defined', () => {
    expect(UpdateAvatarDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new UpdateAvatarDto();
      expect(dto).toBeInstanceOf(UpdateAvatarDto);
    });

    // it('should validate successfully with valid data', async () => {
    //   const dto = new UpdateAvatarDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
