import { ParsePromptDto } from '@api/collections/prompts/dto/parse-prompt.dto';

describe('ParsePromptDto', () => {
  it('should be defined', () => {
    expect(ParsePromptDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new ParsePromptDto();
      expect(dto).toBeInstanceOf(ParsePromptDto);
    });
  });
});
