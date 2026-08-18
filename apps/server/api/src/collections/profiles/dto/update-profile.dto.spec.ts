import { UpdateProfileDto } from '@api/collections/profiles/dto/update-profile.dto';

describe('UpdateProfileDto', () => {
  it('should be defined', () => {
    expect(UpdateProfileDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new UpdateProfileDto();
      expect(dto).toBeInstanceOf(UpdateProfileDto);
    });
  });
});
