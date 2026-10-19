import { resolveStudioPromptAuthor } from '@pages/studio/playground/utils/studio-prompt-author';
import { describe, expect, it } from 'vitest';

const seed = {
  text: 'Serum on wet stone, morning light.',
  type: 'image' as const,
};

describe('resolveStudioPromptAuthor', () => {
  it('marks the proposal sent unchanged as agent-authored', () => {
    expect(
      resolveStudioPromptAuthor(
        seed,
        ' Serum on wet stone, morning light. ',
        'image',
      ),
    ).toBe('agent');
  });

  it('marks a changed proposal as agent_edited', () => {
    expect(
      resolveStudioPromptAuthor(
        seed,
        'Serum on wet stone, dusk light.',
        'image',
      ),
    ).toBe('agent_edited');
  });

  it('records nothing without a seed, for another type, or for an empty prompt', () => {
    expect(resolveStudioPromptAuthor(null, seed.text, 'image')).toBeUndefined();
    expect(resolveStudioPromptAuthor(seed, seed.text, 'video')).toBeUndefined();
    expect(resolveStudioPromptAuthor(seed, '  ', 'image')).toBeUndefined();
  });
});
