import { UpdatePromptDto } from '@api/collections/prompts/dto/update-prompt.dto';

describe('UpdatePromptDto', () => {
  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new UpdatePromptDto();
      expect(dto).toBeInstanceOf(UpdatePromptDto);
    });
  });
});
