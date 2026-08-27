import { PromptEntity } from '@server/collections/prompts/entities/prompt.entity';

describe('PromptEntity', () => {
  it('should be defined', () => {
    expect(new PromptEntity({})).toBeDefined();
  });
});
