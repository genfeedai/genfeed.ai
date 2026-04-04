import { AutoCreateContextDto } from '@api/collections/contexts/dto/autocreate.dto';

describe('AutoCreateContextDto', () => {
  it('should be defined', () => {
    expect(AutoCreateContextDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new AutoCreateContextDto();
      expect(dto).toBeInstanceOf(AutoCreateContextDto);
    });

    // it('should validate successfully with valid data', async () => {
    //   const dto = new AutocreateDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
