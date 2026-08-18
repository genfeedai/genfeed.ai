import { CreateProfileDto } from '@api/collections/profiles/dto/create-profile.dto';

describe('CreateProfileDto', () => {
  it('should be defined', () => {
    expect(CreateProfileDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new CreateProfileDto();
      expect(dto).toBeInstanceOf(CreateProfileDto);
    });
  });
});
