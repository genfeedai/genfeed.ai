import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  assertSafeObjectKey,
  assertSafeObjectKeyPrefix,
  resolveContainedObjectKey,
  resolveContainedPath,
  resolveContainedPathWithoutSymlinks,
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

  it('rejects a missing containment root', () => {
    expect(() =>
      resolveContainedPath('', 'nested/file.txt', createError),
    ).toThrow(/Containment root is not configured/);
  });

  it('rejects a missing candidate path', () => {
    expect(() =>
      resolveContainedPath('/srv/genfeed/files', '', createError),
    ).toThrow(/File path is required/);
  });

  it('allows a candidate that resolves to the root itself', () => {
    expect(resolveContainedPath('/srv/genfeed/files', '.', createError)).toBe(
      '/srv/genfeed/files',
    );
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

  it('accepts a real nested path below the root', async () => {
    await fs.mkdir(path.join(storageRoot, 'ingredients/images'), {
      recursive: true,
    });

    await expect(
      resolveContainedPathWithoutSymlinks(
        storageRoot,
        'ingredients/images/photo.png',
        createError,
      ),
    ).resolves.toBe(path.join(storageRoot, 'ingredients/images/photo.png'));
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

  it('rejects a file symlink pointing outside the root', async () => {
    const secretPath = path.join(outsideDir, 'secret.txt');
    await fs.writeFile(secretPath, 'secret');
    await fs.symlink(secretPath, path.join(storageRoot, 'linked.txt'));

    await expect(
      resolveContainedPathWithoutSymlinks(
        storageRoot,
        'linked.txt',
        createError,
      ),
    ).rejects.toThrow(/must not traverse a symbolic link/);
  });

  it('rejects a path routed through a linked directory', async () => {
    await fs.writeFile(path.join(outsideDir, 'secret.txt'), 'secret');
    await fs.symlink(outsideDir, path.join(storageRoot, 'linked-dir'));

    await expect(
      resolveContainedPathWithoutSymlinks(
        storageRoot,
        'linked-dir/secret.txt',
        createError,
      ),
    ).rejects.toThrow(/must not traverse a symbolic link/);
  });

  it('rejects a dangling symlink, which a write would follow out of the root', async () => {
    await fs.symlink(
      path.join(outsideDir, 'not-created-yet.txt'),
      path.join(storageRoot, 'dangling.txt'),
    );

    await expect(
      resolveContainedPathWithoutSymlinks(
        storageRoot,
        'dangling.txt',
        createError,
      ),
    ).rejects.toThrow(/must not traverse a symbolic link/);
  });

  it('rejects a symlink even when it points back inside the root', async () => {
    await fs.mkdir(path.join(storageRoot, 'real'), { recursive: true });
    await fs.symlink(
      path.join(storageRoot, 'real'),
      path.join(storageRoot, 'alias'),
    );

    await expect(
      resolveContainedPathWithoutSymlinks(
        storageRoot,
        'alias/photo.png',
        createError,
      ),
    ).rejects.toThrow(/must not traverse a symbolic link/);
  });

  it('ignores symlinked ancestors of the root itself', async () => {
    const linkedUserDataDir = path.join(outsideDir, 'linked-user-data');
    await fs.symlink(userDataDir, linkedUserDataDir);
    const rootViaLink = path.join(linkedUserDataDir, 'files');

    await expect(
      resolveContainedPathWithoutSymlinks(
        rootViaLink,
        'photo.png',
        createError,
      ),
    ).resolves.toBe(path.join(rootViaLink, 'photo.png'));
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

  it('validates a legitimate nested key without imposing a prefix', () => {
    const key = 'transcripts/job-1/audio.mp3';
    expect(assertSafeObjectKey(key, createError)).toBe(key);
  });

  it('preserves an empty bucket-root listing prefix', () => {
    expect(assertSafeObjectKeyPrefix('', createError)).toBe('');
  });

  it('rejects an empty or non-string object key', () => {
    expect(() => assertSafeObjectKey('', createError)).toThrow(
      /required and must be a string/,
    );
  });

  it('rejects a leading slash, backslash, or NUL in an object key', () => {
    expect(() => assertSafeObjectKey('/absolute.png', createError)).toThrow(
      /relative POSIX object key/,
    );
    expect(() =>
      assertSafeObjectKey('nested\\escaped.png', createError),
    ).toThrow(/relative POSIX object key/);
    expect(() =>
      assertSafeObjectKey(`nested${'\0'}file.png`, createError),
    ).toThrow(/relative POSIX object key/);
  });

  it('rejects a trailing slash on a concrete object key', () => {
    expect(() =>
      assertSafeObjectKey('ingredients/images/photo.png/', createError),
    ).toThrow(/invalid path segment/);
  });

  it('accepts a listing prefix that ends with a slash', () => {
    expect(assertSafeObjectKeyPrefix('ingredients/images/', createError)).toBe(
      'ingredients/images/',
    );
  });

  it.each(['.', '..', 'nested//empty.png', './same.png'])(
    'rejects object-key segment %s',
    (candidate) => {
      expect(() => assertSafeObjectKey(candidate, createError)).toThrow(
        /invalid path segment/,
      );
    },
  );
});
