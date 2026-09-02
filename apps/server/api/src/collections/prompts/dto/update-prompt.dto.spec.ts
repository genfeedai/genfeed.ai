import { UpdatePromptDto } from '@api/collections/prompts/dto/update-prompt.dto';

describe('UpdatePromptDto', () => {
  it('should be defined', () => {
    expect(UpdatePromptDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new UpdatePromptDto();
      expect(dto).toBeInstanceOf(UpdatePromptDto);
    });
  });
});
