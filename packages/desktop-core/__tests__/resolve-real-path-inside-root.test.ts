import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveRealPathInsideRoot } from '../src/index';

describe('resolveRealPathInsideRoot', () => {
  let base: string;
  let root: string;
  let outside: string;

  beforeEach(() => {
    base = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'genfeed-desktop-core-')),
    );
    root = path.join(base, 'project');
    outside = path.join(base, 'outside');
    fs.mkdirSync(path.join(root, 'footage'), { recursive: true });
    fs.mkdirSync(outside);
    fs.writeFileSync(path.join(outside, 'secret.txt'), 'secret');
  });

  afterEach(() => {
    fs.rmSync(base, { force: true, recursive: true });
  });

  it('resolves existing and not yet existing paths inside the folder', () => {
    expect(resolveRealPathInsideRoot(root, 'footage')).toBe(
      path.join(root, 'footage'),
    );
    expect(resolveRealPathInsideRoot(root, 'renders/final.mp4')).toBe(
      path.join(root, 'renders', 'final.mp4'),
    );
    expect(resolveRealPathInsideRoot(root, '.')).toBe(root);
  });

  it.each(['../outside/secret.txt', '/etc/passwd', 'footage/../../outside'])(
    'refuses %s',
    (rel) => {
      expect(() => resolveRealPathInsideRoot(root, rel)).toThrow(
        'Path escapes workspace root',
      );
    },
  );

  it('refuses a symlink that leaves the folder, for reads and for new files behind it', () => {
    fs.symlinkSync(outside, path.join(root, 'link'));

    expect(() => resolveRealPathInsideRoot(root, 'link/secret.txt')).toThrow(
      'Path escapes workspace root',
    );
    expect(() => resolveRealPathInsideRoot(root, 'link/new.txt')).toThrow(
      'Path escapes workspace root',
    );
  });

  it('refuses a dangling symlink', () => {
    fs.symlinkSync(path.join(base, 'missing'), path.join(root, 'dangling'));

    expect(() => resolveRealPathInsideRoot(root, 'dangling')).toThrow(
      'Path escapes workspace root',
    );
  });

  it('allows a symlink that stays inside the folder', () => {
    fs.symlinkSync(path.join(root, 'footage'), path.join(root, 'alias'));

    expect(resolveRealPathInsideRoot(root, 'alias/clip.mov')).toBe(
      path.join(root, 'alias', 'clip.mov'),
    );
  });
});
