import { describe, expect, it } from 'vitest';
import { isNewerRelease, parseLatestRelease } from './release-update';

describe('release comparisons', () => {
  it.each([
    ['0.1.10', '0.1.9', true],
    ['0.1.9', '0.1.10', false],
    ['0.1.10', '0.1.10', false],
    ['1.0.0', '1.0.0-beta.1', true],
    ['1.0.0', '2.0.0', false],
  ])('compares %s to %s numerically', (latest, current, newer) => {
    expect(isNewerRelease(latest, current)).toBe(newer);
  });
  it('does not claim unknown versions are current', () => {
    expect(() => isNewerRelease('1.0.0', 'development')).toThrow();
  });
  it('rejects an untrusted update URL', () => {
    expect(() =>
      parseLatestRelease({
        tag: 'v1.0.0',
        version: '1.0.0',
        url: 'https://evil.test',
      }),
    ).toThrow();
  });
});
