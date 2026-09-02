import { EnhancePromptDto } from '@api/collections/contexts/dto/enhance-prompt.dto';

describe('EnhancePromptDto', () => {
  it('should be defined', () => {
    expect(EnhancePromptDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new EnhancePromptDto();
      expect(dto).toBeInstanceOf(EnhancePromptDto);
    });
  });
});
