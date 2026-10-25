import type { StudioReferenceMentionSource } from '@genfeedai/contracts/interfaces/studio/studio-reference-mention.interface';
import {
  numberReferenceMentions,
  reconcileReferenceMentionOrder,
  restoreReferenceMentionOrder,
  validateReferenceMentions,
} from '@genfeedai/helpers/content/reference-mention.util';
import { describe, expect, it } from 'vitest';

function source(
  id: string,
  kind: StudioReferenceMentionSource['kind'] = 'image',
  origin: StudioReferenceMentionSource['source'] = 'library',
): StudioReferenceMentionSource {
  return {
    id,
    key: `${origin}:${id}`,
    kind,
    name: id,
    role: 'reference',
    source: origin,
  };
}

describe('Studio positional reference mentions', () => {
  it('numbers each media kind in attachment order and preserves the submitted list', () => {
    const references = numberReferenceMentions([
      source('person'),
      source('driver', 'video'),
      source('place'),
      source('voice', 'audio'),
    ]);
    expect(references.map(({ token, id }) => [token, id])).toEqual([
      ['@Image1', 'person'],
      ['@Video1', 'driver'],
      ['@Image2', 'place'],
      ['@Audio1', 'voice'],
    ]);
    expect(
      validateReferenceMentions(
        'Use @Image2 behind @Image1 with @Video1 and @Audio1.',
        references,
      ),
    ).toEqual({ errors: [], unusedTokens: [] });
  });

  it('keeps mixed upload/Library attach order through upload completion', () => {
    const library = source('person');
    const upload = { ...source('upload', 'image', 'upload'), id: undefined };
    const pending = reconcileReferenceMentionOrder(
      [library],
      [upload, library],
    );
    expect(pending.map((reference) => reference.key)).toEqual([
      library.key,
      upload.key,
    ]);
    const complete = reconcileReferenceMentionOrder(pending, [
      { ...upload, id: 'completed-id' },
      library,
    ]);
    expect(numberReferenceMentions(complete).map(({ id }) => id)).toEqual([
      'person',
      'completed-id',
    ]);
  });

  it('renumbers a surviving identity on removal and explicit reorder', () => {
    const first = source('first');
    const second = source('second');
    const video = source('video', 'video', 'upload');
    const original = reconcileReferenceMentionOrder(
      [first, video, second],
      [video, second, first],
    );
    expect(
      numberReferenceMentions(original).map(({ token, id }) => [token, id]),
    ).toEqual([
      ['@Image1', 'second'],
      ['@Video1', 'video'],
      ['@Image2', 'first'],
    ]);
    expect(
      numberReferenceMentions(original.filter(({ id }) => id !== 'second'))[1]
        ?.token,
    ).toBe('@Image1');
  });

  it('blocks unknown literal slots and removed chip identities even when its number is reused', () => {
    const references = numberReferenceMentions([source('second')]);
    expect(
      validateReferenceMentions(
        '@Image2 @Video1 @Audio1 @Image0 @Image01',
        references,
      ).errors,
    ).toHaveLength(5);
    expect(
      validateReferenceMentions('@Image1', references, {
        type: 'doc',
        content: [
          {
            type: 'referenceMention',
            attrs: { key: 'library:first', id: 'first', label: '@Image1' },
          },
        ],
      }).errors[0],
    ).toContain('was removed');
  });

  it('reports unused attachments without blocking ordinary prompts or character names', () => {
    expect(
      validateReferenceMentions(
        'Anna in a studio',
        numberReferenceMentions([source('person')]),
      ),
    ).toEqual({ errors: [], unusedTokens: ['@Image1'] });
  });
  it('restores mixed-source saved order and uses existing uploads-first order without metadata', () => {
    const upload = { ...source('upload', 'image', 'upload'), order: 1 };
    const library = { ...source('library'), order: 0 };
    expect(
      restoreReferenceMentionOrder([upload, library]).map(({ id }) => id),
    ).toEqual(['library', 'upload']);
    expect(
      restoreReferenceMentionOrder([
        source('upload', 'image', 'upload'),
        source('library'),
      ]).map(({ id }) => id),
    ).toEqual(['upload', 'library']);
    expect(
      restoreReferenceMentionOrder([
        { ...upload, order: -1 },
        { ...library, order: 99 },
      ]).map(({ id }) => id),
    ).toEqual(['upload', 'library']);
  });
  it('does not retain removed-chip validation after the prompt is cleared', () => {
    expect(
      validateReferenceMentions('', [], {
        type: 'referenceMention',
        attrs: { id: 'gone', key: 'gone', label: '@Image1' },
      }).errors,
    ).toEqual([]);
  });
});
