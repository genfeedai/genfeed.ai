import { describe, expect, it } from 'bun:test';
import { resolveCacheAssetPath } from './cache-asset-path.util';

describe('resolveCacheAssetPath', () => {
  it.each([
    ['clip.mp4', '/cache/clip.mp4'],
    ['thumb 1.png', '/cache/thumb 1.png'],
  ])('keeps %s inside the cache directory', (filename, expected) => {
    expect(resolveCacheAssetPath('/cache', filename)).toBe(expected);
  });

  it.each([
    '../../.config/autostart/x.desktop',
    '/etc/cron.d/x',
    'nested/file.png',
    '..\\..\\x.exe',
    '..',
    '.',
    '',
  ])('rejects %j', (filename) => {
    expect(() => resolveCacheAssetPath('/cache', filename)).toThrow(
      'Invalid cache asset filename',
    );
  });

  it('rejects a non-string name', () => {
    expect(() => resolveCacheAssetPath('/cache', undefined)).toThrow(
      'Invalid cache asset filename',
    );
  });
});
