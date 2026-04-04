import { CreatePromptDto } from '@api/collections/prompts/dto/create-prompt.dto';

describe('CreatePromptDto', () => {
  it('should be defined', () => {
    expect(CreatePromptDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new CreatePromptDto();
      expect(dto).toBeInstanceOf(CreatePromptDto);
    });

    // it('should validate successfully with valid data', async () => {
    //   const dto = new CreatePromptDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
