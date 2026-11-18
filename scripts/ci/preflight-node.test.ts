import { describe, expect, it } from 'vitest';
import { isPinnedNode, nodeArchiveFor, parseChecksum } from './preflight-node';

describe('nodeArchiveFor', () => {
  it.each([
    {
      arch: 'x64',
      expected: {
        directory: 'node-v26.12.1-linux-x64',
        fileName: 'node-v26.12.1-linux-x64.tar.xz',
        tarFlags: '-xJf',
      },
      platform: 'linux' as const,
    },
    {
      arch: 'arm64',
      expected: {
        directory: 'node-v26.12.1-darwin-arm64',
        fileName: 'node-v26.12.1-darwin-arm64.tar.gz',
        tarFlags: '-xzf',
      },
      platform: 'darwin' as const,
    },
    { arch: 'x64', expected: null, platform: 'win32' as const },
    { arch: 'ia32', expected: null, platform: 'linux' as const },
  ])('maps $platform $arch', ({ arch, expected, platform }) => {
    expect(nodeArchiveFor('26.12.1', platform, arch)).toEqual(expected);
  });

  it('rejects a version that is not three numbers', () => {
    expect(nodeArchiveFor('26.12.1; rm -rf /', 'linux', 'x64')).toBeNull();
  });
});

describe('isPinnedNode', () => {
  it.each([
    { expected: true, host: 'v26.3.0' },
    { expected: false, host: 'v22.23.4' },
  ])('compares major versions for $host', ({ expected, host }) => {
    expect(isPinnedNode(host, '26.12.1')).toBe(expected);
  });
});

describe('parseChecksum', () => {
  const hash = 'a'.repeat(64);
  const shasums = `${'b'.repeat(64)}  node-v26.12.1-darwin-arm64.tar.gz\n${hash}  node-v26.12.1-linux-x64.tar.xz\n`;

  it('returns the hash listed for the archive', () => {
    expect(parseChecksum(shasums, 'node-v26.12.1-linux-x64.tar.xz')).toBe(hash);
  });

  it('returns null for an archive that is not listed', () => {
    expect(parseChecksum(shasums, 'node-v26.12.1-win-x64.zip')).toBeNull();
  });
});
