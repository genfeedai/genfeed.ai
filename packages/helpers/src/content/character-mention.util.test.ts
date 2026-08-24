import { describe, expect, it } from 'vitest';
import {
  dedupeCharacterReferenceIds,
  serializeCharacterMentionDisplayName,
} from './character-mention.util';

describe('character-mention.util', () => {
  it('serializes a mention token to the display name', () => {
    expect(
      serializeCharacterMentionDisplayName({
        handle: 'anna',
        id: 'p1',
        label: 'Anna',
      }),
    ).toBe('Anna');
  });

  it('falls back to the handle when label is empty', () => {
    expect(
      serializeCharacterMentionDisplayName({
        handle: 'anna',
        id: 'p1',
        label: '  ',
      }),
    ).toBe('anna');
  });

  it('dedupes resolved reference ids against already-attached ones', () => {
    expect(
      dedupeCharacterReferenceIds(['img-1', 'img-2'], ['img-2', 'img-3']),
    ).toEqual(['img-1', 'img-2', 'img-3']);
  });
});
