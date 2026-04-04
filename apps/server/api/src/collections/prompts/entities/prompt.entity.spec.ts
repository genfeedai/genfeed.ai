import { PromptEntity } from '@api/collections/prompts/entities/prompt.entity';

describe('PromptEntity', () => {
  it('should be defined', () => {
    expect(new PromptEntity({})).toBeDefined();
  });
});
