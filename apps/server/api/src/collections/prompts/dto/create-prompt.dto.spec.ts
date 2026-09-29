import { CreatePromptDto } from '@api/collections/prompts/dto/create-prompt.dto';

describe('CreatePromptDto', () => {
  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new CreatePromptDto();
      expect(dto).toBeInstanceOf(CreatePromptDto);
    });
  });
});
