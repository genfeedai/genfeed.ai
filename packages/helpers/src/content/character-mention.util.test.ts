import { describe, expect, it } from 'vitest';
import {
  applyCharacterMentionsToSubmit,
  characterMentionMissingReferenceNotice,
  dedupeCharacterReferenceIds,
  extractCharacterMentionTokens,
  findTypedCharacterMentions,
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

  it('sends every reference of a character in priority order', () => {
    const result = applyCharacterMentionsToSubmit({
      catalog: [
        {
          avatarIngredientId: 'img-front',
          handle: 'anna',
          hasReferenceImage: true,
          id: 'p1',
          label: 'Anna',
          referenceIngredientIds: ['img-front', 'img-side', 'img-back'],
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
      existingReferenceIds: ['img-side'],
      text: '@anna walking',
    });

    // Existing references keep their place; duplicates are dropped.
    expect(result.referenceIds).toEqual(['img-side', 'img-front', 'img-back']);
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

  describe('typed @handles', () => {
    const catalog = [
      {
        avatarIngredientId: 'img-vincent',
        handle: 'vincent',
        hasReferenceImage: true,
        id: 'p1',
        label: 'Vincent',
        referenceIngredientIds: ['img-vincent'],
      },
    ];

    it('finds a typed handle without case and ignores unknown ones', () => {
      expect(
        findTypedCharacterMentions('Dance with @Vincent. And @nobody', catalog),
      ).toEqual([{ handle: 'vincent', id: 'p1', label: 'Vincent' }]);
    });

    it('skips a character that is already a chip', () => {
      expect(
        findTypedCharacterMentions('@vincent', catalog, [
          { handle: 'vincent', id: 'p1', label: 'Vincent' },
        ]),
      ).toEqual([]);
    });

    it('resolves a typed handle to its references and display name on submit', () => {
      const result = applyCharacterMentionsToSubmit({
        catalog,
        document: { content: [], type: 'doc' },
        existingReferenceIds: [],
        text: 'Create a dance featuring @vincent.',
      });

      expect(result.referenceIds).toEqual(['img-vincent']);
      expect(result.text).toBe('Create a dance featuring Vincent.');
      expect(result.notices).toEqual([]);
    });
  });
});
