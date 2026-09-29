import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  assertSafeObjectKey,
  resolveContainedObjectKey,
  resolveContainedPath,
  resolveContainedPathWithoutSymlinks,
} from './path-containment';

class ContainmentError extends Error {}

const createError = (message: string) => new ContainmentError(message);

describe('path containment', () => {
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

  it.each([
    'nested/../file.txt',
    'nested\\file.txt',
    'C:/Windows/System32/config',
    'nested/%2e%2e/file.txt',
    'nested/%252e%252e/file.txt',
    'nested%2ffile.txt',
  ])('rejects ambiguous filesystem syntax %s', (candidate) => {
    expect(() =>
      resolveContainedPath('/srv/genfeed/files', candidate, createError),
    ).toThrow(ContainmentError);
  });

  it('rejects a missing containment root', () => {
    expect(() =>
      resolveContainedPath('', 'nested/file.txt', createError),
    ).toThrow(/Containment root is not configured/);
  });
});

/**
 * The desktop root is Electron's `userData` directory, so containment failures
 * here reach the user's real home folder rather than a scratch volume. These
 * run against a real filesystem because symlinks cannot be faked usefully.
 */
describe('symlink containment under a userData root', () => {
  let userDataDir: string;
  let storageRoot: string;
  let outsideDir: string;

  beforeEach(async () => {
    userDataDir = await fs.mkdtemp(path.join(tmpdir(), 'genfeed-user-data-'));
    storageRoot = path.join(userDataDir, 'files');
    outsideDir = await fs.mkdtemp(path.join(tmpdir(), 'genfeed-outside-'));
    await fs.mkdir(storageRoot, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(userDataDir, { force: true, recursive: true });
    await fs.rm(outsideDir, { force: true, recursive: true });
  });

  it.each([
    '../pglite-db/postgres',
    '../../.ssh/id_rsa',
    'nested/../../escaped.png',
    '/etc/passwd',
  ])('rejects lexical escape %s', async (candidate) => {
    await expect(
      resolveContainedPathWithoutSymlinks(storageRoot, candidate, createError),
    ).rejects.toThrow(ContainmentError);
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
    'nested/%2e%2e/escaped.png',
    'nested/%252e%252e/escaped.png',
    'nested%2fescaped.png',
  ])('rejects object-key escape %s', (candidate) => {
    expect(() =>
      resolveContainedObjectKey('ingredients/images', candidate, createError),
    ).toThrow(ContainmentError);
  });

  it('rejects an empty or non-string object key', () => {
    expect(() => assertSafeObjectKey('', createError)).toThrow(
      /required and must be a string/,
    );
  });

  it('rejects backslash or NUL separator confusion in an object key', () => {
    expect(() =>
      assertSafeObjectKey('nested\\escaped.png', createError),
    ).toThrow(/traversal or separator confusion/);
    expect(() =>
      assertSafeObjectKey(`nested${'\0'}file.png`, createError),
    ).toThrow(/traversal or separator confusion/);
  });

  it('rejects a trailing slash on a concrete object key', () => {
    expect(() =>
      assertSafeObjectKey('ingredients/images/photo.png/', createError),
    ).toThrow(/invalid path segment/);
  });
});
