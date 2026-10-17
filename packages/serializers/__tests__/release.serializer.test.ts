import { serializeLatestRelease } from '@serializers/server/system/release.serializer';
import { describe, expect, it } from 'vitest';

describe('serializeLatestRelease', () => {
  it('reduces a stable release to its public tag, url and version', () => {
    expect(
      serializeLatestRelease({
        draft: false,
        prerelease: false,
        tag_name: 'v1.2.3',
        upload_url: 'https://uploads.github.com/private',
      }),
    ).toEqual({
      tag: 'v1.2.3',
      url: 'https://github.com/genfeedai/genfeed.ai/releases/tag/v1.2.3',
      version: '1.2.3',
    });
  });

  it.each([
    ['null', null],
    ['a non-object', 'v1.2.3'],
    ['a missing tag', { draft: false, prerelease: false }],
    ['a non-semver tag', { draft: false, prerelease: false, tag_name: 'v1' }],
    ['a draft', { draft: true, prerelease: false, tag_name: 'v1.2.3' }],
    ['a prerelease', { draft: false, prerelease: true, tag_name: 'v1.2.3' }],
  ])('rejects %s', (_label, value) => {
    expect(() => serializeLatestRelease(value)).toThrow(
      'Invalid stable release',
    );
  });
});
