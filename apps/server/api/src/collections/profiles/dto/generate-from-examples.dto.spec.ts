import { GenerateFromExamplesDto } from '@api/collections/profiles/dto/generate-from-examples.dto';

describe('GenerateFromExamplesDto', () => {
  it('should be defined', () => {
    expect(GenerateFromExamplesDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new GenerateFromExamplesDto();
      expect(dto).toBeInstanceOf(GenerateFromExamplesDto);
    });

    // it('should validate successfully with valid data', async () => {
    //   const dto = new GenerateFromExamplesDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
