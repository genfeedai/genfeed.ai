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

    // it('should validate successfully with valid data', async () => {
    //   const dto = new CreateProfileDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
