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
  });
});
