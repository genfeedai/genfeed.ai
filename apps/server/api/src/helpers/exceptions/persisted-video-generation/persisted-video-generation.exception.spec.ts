import { HttpException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { PersistedVideoGenerationException } from './persisted-video-generation.exception';

interface InvalidPersistedVideoIdsCase {
  readonly label: string;
  readonly ids: readonly unknown[];
}

const invalidPersistedVideoIdsCases: readonly InvalidPersistedVideoIdsCase[] = [
  { label: 'empty list', ids: [] },
  { label: 'empty ID', ids: [''] },
  { label: 'duplicate IDs', ids: ['a', 'a'] },
  { label: 'leading whitespace', ids: [' a'] },
  { label: 'trailing whitespace', ids: ['a '] },
  { label: 'newline control', ids: ['a\n'] },
  { label: 'null control', ids: ['a\u0000'] },
  { label: 'oversized ID', ids: ['a'.repeat(129)] },
  { label: 'oversized list', ids: ['a', 'b', 'c', 'd', 'e'] },
  { label: 'numeric ID', ids: [1] },
  { label: 'mixed null ID', ids: ['a', null] },
];

describe('PersistedVideoGenerationException', () => {
  it('preserves typed HTTP response/status/name/cause and copies bounded IDs', () => {
    const original = new HttpException(
      {
        code: 'VIDEO_INPUT',
        detail: 'Review input',
        source: { pointer: '/text' },
      },
      422,
    );
    const ids = ['one', 'two', 'three', 'four'];
    const wrapped = PersistedVideoGenerationException.from(
      original,
      ids,
    ) as PersistedVideoGenerationException;
    ids[0] = 'changed';
    expect(wrapped.getResponse()).toBe(original.getResponse());
    expect(wrapped.getStatus()).toBe(422);
    expect(wrapped.name).toBe(original.name);
    expect(wrapped.cause).toBe(original);
    expect(wrapped.persistedVideoIngredientIds).toEqual([
      'one',
      'two',
      'three',
      'four',
    ]);
    expect(PersistedVideoGenerationException.from(wrapped, ['other'])).toBe(
      wrapped,
    );
  });
  it('redacts a generic provider failure while retaining its private cause', () => {
    const original = new Error('private provider diagnostic');
    const wrapped = PersistedVideoGenerationException.from(original, [
      'one',
    ]) as PersistedVideoGenerationException;
    expect(wrapped.getStatus()).toBe(500);
    expect(wrapped.getResponse()).toEqual({
      title: 'Internal Server Error',
      detail: 'An unexpected error occurred',
    });
    expect(wrapped.cause).toBe(original);
  });
  it.each(invalidPersistedVideoIdsCases)(
    'refuses the entire invalid ID list: $label',
    ({ ids }) => {
      const original = new Error('original');
      const result: unknown = Reflect.apply(
        PersistedVideoGenerationException.from,
        PersistedVideoGenerationException,
        [original, ids],
      );
      expect(result).toBe(original);
    },
  );
});
