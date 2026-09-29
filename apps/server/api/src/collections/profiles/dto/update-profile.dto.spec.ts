import { UpdateProfileDto } from '@api/collections/profiles/dto/update-profile.dto';

describe('UpdateProfileDto', () => {
  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new UpdateProfileDto();
      expect(dto).toBeInstanceOf(UpdateProfileDto);
    });
  });
});
