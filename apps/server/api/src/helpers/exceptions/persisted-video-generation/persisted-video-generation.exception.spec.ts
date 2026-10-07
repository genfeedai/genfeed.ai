import { HttpException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { PersistedVideoGenerationException } from './persisted-video-generation.exception';

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
  it.each([
    [],
    [''],
    ['a', 'a'],
    [' a'],
    ['a '],
    ['a\n'],
    ['a\u0000'],
    ['a'.repeat(129)],
    ['a', 'b', 'c', 'd', 'e'],
    [1],
    ['a', null],
  ])('refuses the entire invalid ID list %j', (ids) => {
    const original = new Error('original');
    expect(
      PersistedVideoGenerationException.from(
        original,
        ids as readonly string[],
      ),
    ).toBe(original);
  });
});
