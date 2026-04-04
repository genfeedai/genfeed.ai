import { EnhancePromptDto } from '@api/collections/prompts/dto/enhance-prompt.dto';

describe('EnhancePromptDto', () => {
  it('should be defined', () => {
    expect(EnhancePromptDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new EnhancePromptDto();
      expect(dto).toBeInstanceOf(EnhancePromptDto);
    });

    // it('should validate successfully with valid data', async () => {
    //   const dto = new EnhancePromptDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
