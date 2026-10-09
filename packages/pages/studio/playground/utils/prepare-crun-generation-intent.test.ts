import { describe, expect, it, vi } from 'vitest';
import { prepareCrunGenerationIntent } from './prepare-crun-generation-intent';

describe('Crun rich prompt intent preparation', () => {
  it('uses one editor document for both character references and stripped skill tokens', () => {
    const document = {
      type: 'doc',
      content: [{ type: 'characterMention', attrs: { id: 'character-1' } }],
    };
    const resolveCharacterMentions = vi.fn(() => ({
      text: 'Portrait of Ada',
      referenceIds: ['existing-1', 'avatar-1'],
      notices: [],
    }));
    const prepared = prepareCrunGenerationIntent({
      document,
      existingReferenceIds: ['existing-1'],
      prompt: '/portrait @Ada',
      resolvePromptCommands: () => ({
        content: '@Ada',
        skillSlugs: ['portrait'],
      }),
      resolveCharacterMentions,
    });
    expect(resolveCharacterMentions).toHaveBeenCalledWith({
      document,
      existingReferenceIds: ['existing-1'],
      text: '@Ada',
    });
    expect(prepared).toEqual({
      text: 'Portrait of Ada',
      referenceIds: ['existing-1', 'avatar-1'],
      notices: [],
      skillSlugs: ['portrait'],
    });
    expect(document.content[0]?.attrs.id).toBe('character-1');
  });
});
