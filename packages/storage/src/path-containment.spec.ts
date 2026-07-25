import { describe, expect, it } from 'vitest';

import {
  assertObjectKeyWithinPrefix,
  assertSafeObjectKey,
  assertSafeObjectKeyPrefix,
  resolveContainedObjectKey,
  resolveContainedPath,
} from './path-containment';

class ContainmentError extends Error {}

const createError = (message: string) => new ContainmentError(message);

describe('path containment', () => {
  it('accepts a legitimate nested filesystem path', () => {
    expect(
      resolveContainedPath(
        '/srv/genfeed/files',
        'nested/file.txt',
        createError,
      ),
    ).toBe('/srv/genfeed/files/nested/file.txt');
  });

  it.each([
    '../escaped.txt',
    'nested/../../escaped.txt',
    '/etc/passwd',
    '/srv/genfeed/files-sibling/file.txt',
  ])('rejects filesystem escape %s', (candidate) => {
    expect(() =>
      resolveContainedPath('/srv/genfeed/files', candidate, createError),
    ).toThrow(ContainmentError);
  });
});

describe('object-key containment', () => {
  it('preserves a legitimate nested key beneath the prefix', () => {
    expect(
      resolveContainedObjectKey(
        'ingredients/images/',
        'organizations/org-1/photo.png',
        createError,
      ),
    ).toBe('ingredients/images/organizations/org-1/photo.png');
  });

  it.each([
    '../escaped.png',
    'nested/../../escaped.png',
    '/absolute.png',
    'nested\\escaped.png',
    'nested//empty.png',
    './same.png',
  ])('rejects object-key escape %s', (candidate) => {
    expect(() =>
      resolveContainedObjectKey('ingredients/images', candidate, createError),
    ).toThrow(ContainmentError);
  });

  it('rejects prefix confusion for an existing key', () => {
    expect(() =>
      assertObjectKeyWithinPrefix(
        'ingredients/images',
        'ingredients/images-evil/file.png',
        createError,
      ),
    ).toThrow(ContainmentError);
  });

  it('validates a legitimate nested key without imposing a prefix', () => {
    const key = 'transcripts/job-1/audio.mp3';
    expect(assertSafeObjectKey(key, createError)).toBe(key);
  });

  it('preserves an empty bucket-root listing prefix', () => {
    expect(assertSafeObjectKeyPrefix('', createError)).toBe('');
  });

  it('accepts an existing nested key without rewriting it', () => {
    const key = 'ingredients/images/org-1/photo.png';
    expect(
      assertObjectKeyWithinPrefix('ingredients/images/', key, createError),
    ).toBe(key);
  });
});
