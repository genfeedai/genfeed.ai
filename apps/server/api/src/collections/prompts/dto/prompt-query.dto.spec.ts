import { PromptQueryDto } from '@api/collections/prompts/dto/prompt-query.dto';

describe('PromptQueryDto', () => {
  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new PromptQueryDto();
      expect(dto).toBeInstanceOf(PromptQueryDto);
    });
  });
});
