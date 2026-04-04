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

    // it('should validate successfully with valid data', async () => {
    //   const dto = new UpdateProfileDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
