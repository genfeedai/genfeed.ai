import { createStudioCharacterMentionExtension } from '@genfeedai/agent/extensions/studio-character-mention';
import { describe, expect, it } from 'vitest';

describe('createStudioCharacterMentionExtension', () => {
  it('configures a character-only @ suggestion', () => {
    const extension = createStudioCharacterMentionExtension(() => [
      {
        avatarIngredientId: 'img-1',
        handle: 'anna',
        hasReferenceImage: true,
        id: 'p1',
        label: 'Anna',
      },
    ]);

    expect(extension.name).toBe('characterMention');
    expect(extension.options.suggestion.char).toBe('@');

    const items = extension.options.suggestion.items({ query: 'an' }) as Array<{
      handle: string;
    }>;
    expect(items).toEqual([expect.objectContaining({ handle: 'anna' })]);
  });
});
