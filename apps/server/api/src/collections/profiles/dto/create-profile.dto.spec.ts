import { CreateProfileDto } from '@api/collections/profiles/dto/create-profile.dto';

describe('CreateProfileDto', () => {
  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new CreateProfileDto();
      expect(dto).toBeInstanceOf(CreateProfileDto);
    });
  });
});
