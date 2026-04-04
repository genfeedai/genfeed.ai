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

    // it('should validate successfully with valid data', async () => {
    //   const dto = new UpdatePromptDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
