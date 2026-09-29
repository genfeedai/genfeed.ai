import { EnhancePromptDto } from '@api/collections/contexts/dto/enhance-prompt.dto';

describe('EnhancePromptDto', () => {
  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new EnhancePromptDto();
      expect(dto).toBeInstanceOf(EnhancePromptDto);
    });
  });
});
