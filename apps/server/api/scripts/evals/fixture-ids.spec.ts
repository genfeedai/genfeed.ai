import { createHmac } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  deriveBrandFixtureId,
  deriveRowId,
  hmacHex,
  readKeyFile,
} from './fixture-ids';
import {
  GOLDEN_CONTENT_KINDS,
  SYNTHETIC_ANONYMISER_KEY,
} from './golden-set.constants';

const KEY = SYNTHETIC_ANONYMISER_KEY;

describe('fixture ids', () => {
  it('uses SHA-256 HMAC over the UTF-8 message', () => {
    expect(hmacHex(KEY, 'brand:org:brand')).toBe(
      createHmac('sha256', KEY).update('brand:org:brand', 'utf8').digest('hex'),
    );
  });

  it('derives stable brand ids in the required format', () => {
    const id = deriveBrandFixtureId(KEY, 'org', 'brand');
    expect(id).toMatch(/^brand-[0-9a-f]{12}$/);
    expect(id).toBe(`brand-${hmacHex(KEY, 'brand:org:brand').slice(0, 12)}`);
    expect(deriveBrandFixtureId(KEY, 'org', 'brand')).toBe(id);
  });

  it.each(GOLDEN_CONTENT_KINDS)('derives stable row ids for %s', (kind) => {
    const id = deriveRowId(KEY, 'org', kind, 'post:record');
    expect(id).toMatch(/^gs1-[a-z-]+-[0-9a-f]{16}$/);
    expect(id).toBe(
      `gs1-${kind}-${hmacHex(KEY, 'row:org:post:record').slice(0, 16)}`,
    );
    expect(deriveRowId(KEY, 'org', kind, 'post:record')).toBe(id);
  });

  it('changes brand ids when the key, organization or brand changes', () => {
    const id = deriveBrandFixtureId(KEY, 'org', 'brand');
    expect(deriveBrandFixtureId(`${KEY}-other`, 'org', 'brand')).not.toBe(id);
    expect(deriveBrandFixtureId(KEY, 'other-org', 'brand')).not.toBe(id);
    expect(deriveBrandFixtureId(KEY, 'org', 'other-brand')).not.toBe(id);
  });

  it('changes row ids when the key, organization, kind or content key changes', () => {
    const id = deriveRowId(KEY, 'org', 'social-post', 'post:record');
    expect(
      deriveRowId(`${KEY}-other`, 'org', 'social-post', 'post:record'),
    ).not.toBe(id);
    expect(
      deriveRowId(KEY, 'other-org', 'social-post', 'post:record'),
    ).not.toBe(id);
    expect(deriveRowId(KEY, 'org', 'thread', 'post:record')).not.toBe(id);
    expect(deriveRowId(KEY, 'org', 'social-post', 'post:other')).not.toBe(id);
  });
});

describe('readKeyFile', () => {
  it('trims an outside-repo key and accepts exactly 32 characters', () => {
    const directory = mkdtempSync(join(tmpdir(), 'golden-set-key-'));
    try {
      const repoRoot = join(directory, 'repo');
      mkdirSync(repoRoot);
      const keyFile = join(directory, 'key');
      writeFileSync(keyFile, `  ${'k'.repeat(32)}\n`);
      expect(readKeyFile(keyFile, repoRoot)).toBe('k'.repeat(32));
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it.each(['', 'k'.repeat(31), `  ${'k'.repeat(31)}\n`])(
    'rejects a key shorter than 32 trimmed characters',
    (key) => {
      const directory = mkdtempSync(join(tmpdir(), 'golden-set-key-'));
      try {
        const repoRoot = join(directory, 'repo');
        mkdirSync(repoRoot);
        const keyFile = join(directory, 'key');
        writeFileSync(keyFile, key);
        expect(() => readKeyFile(keyFile, repoRoot)).toThrow(
          'at least 32 characters',
        );
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    },
  );

  it('rejects in-repo key paths, including an outside symlink to an in-repo key', () => {
    const directory = mkdtempSync(join(tmpdir(), 'golden-set-key-'));
    try {
      const repoRoot = join(directory, 'repo');
      mkdirSync(repoRoot);
      const keyFile = join(repoRoot, 'key');
      writeFileSync(keyFile, KEY);
      const link = join(directory, 'key-link');
      symlinkSync(keyFile, link);
      expect(() => readKeyFile(keyFile, repoRoot)).toThrow(
        'outside the repository',
      );
      expect(() => readKeyFile(link, repoRoot)).toThrow(
        'outside the repository',
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rejects a relative key path', () => {
    const directory = mkdtempSync(join(tmpdir(), 'golden-set-key-'));
    try {
      expect(() => readKeyFile('key', directory)).toThrow('must be absolute');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
