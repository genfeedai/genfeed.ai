import { describe, expect, it } from 'vitest';
import {
  applyCharacterMentionsToSubmit,
  characterMentionMissingReferenceNotice,
  dedupeCharacterReferenceIds,
  extractCharacterMentionTokens,
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

  it('extracts character mention tokens from a prompt document', () => {
    expect(
      extractCharacterMentionTokens({
        content: [
          {
            attrs: { handle: 'anna', id: 'p1', label: 'Anna' },
            type: 'characterMention',
          },
          { text: ' walking', type: 'text' },
        ],
        type: 'doc',
      }),
    ).toEqual([{ handle: 'anna', id: 'p1', label: 'Anna' }]);
  });

  it('serializes leftover @handle text and merges canonical reference ids', () => {
    const result = applyCharacterMentionsToSubmit({
      catalog: [
        {
          avatarIngredientId: 'img-anna',
          handle: 'anna',
          hasReferenceImage: true,
          id: 'p1',
          label: 'Anna',
        },
      ],
      document: {
        content: [
          {
            attrs: { handle: 'anna', id: 'p1', label: 'Anna' },
            type: 'characterMention',
          },
        ],
        type: 'doc',
      },
      existingReferenceIds: ['img-0'],
      text: '@anna walking',
    });

    expect(result.text).toBe('Anna walking');
    expect(result.referenceIds).toEqual(['img-0', 'img-anna']);
    expect(result.notices).toEqual([]);
  });

  it('omits no-image characters with a non-blocking notice', () => {
    const token = { handle: 'ghost', id: 'p2', label: 'Ghost' };
    const result = applyCharacterMentionsToSubmit({
      catalog: [
        {
          avatarIngredientId: null,
          handle: 'ghost',
          hasReferenceImage: false,
          id: 'p2',
          label: 'Ghost',
        },
      ],
      document: {
        content: [{ attrs: token, type: 'characterMention' }],
        type: 'doc',
      },
      existingReferenceIds: ['img-0'],
      text: 'Ghost walking',
    });

    expect(result.referenceIds).toEqual(['img-0']);
    expect(result.notices).toEqual([
      characterMentionMissingReferenceNotice(token),
    ]);
  });
});
