import { ApplyProfileDto } from '@api/collections/profiles/dto/apply-profile.dto';

describe('ApplyProfileDto', () => {
  it('should be defined', () => {
    expect(ApplyProfileDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new ApplyProfileDto();
      expect(dto).toBeInstanceOf(ApplyProfileDto);
    });

    // it('should validate successfully with valid data', async () => {
    //   const dto = new ApplyProfileDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
