import { PromptQueryDto } from '@api/collections/prompts/dto/prompt-query.dto';

describe('PromptQueryDto', () => {
  it('should be defined', () => {
    expect(PromptQueryDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new PromptQueryDto();
      expect(dto).toBeInstanceOf(PromptQueryDto);
    });

    // it('should validate successfully with valid data', async () => {
    //   const dto = new PromptQueryDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
