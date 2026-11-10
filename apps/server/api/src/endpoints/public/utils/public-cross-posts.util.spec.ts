import {
  crossPostTextKey,
  findCrossPostIds,
  listCrossPosts,
} from '@api/endpoints/public/utils/public-cross-posts.util';
import { describe, expect, it } from 'vitest';

const native = {
  description: '<p>Shipped the new   studio today &amp; it is fast</p>',
  id: 'native',
  platform: 'genfeed',
  publishedAt: '2026-11-08T10:00:00.000Z',
};

const onX = {
  description: 'Shipped the new studio today & it is fast',
  id: 'x-post',
  platform: 'twitter',
  publishedAt: '2026-11-08T10:01:00.000Z',
  url: 'https://x.com/acme/status/1',
};

const onLinkedIn = {
  description: 'shipped the new studio today & it is fast',
  id: 'li-post',
  platform: 'linkedin',
  publishedAt: '2026-11-09T09:00:00.000Z',
  url: 'https://www.linkedin.com/feed/update/1',
};

const weekLater = {
  ...onX,
  id: 'x-later',
  publishedAt: '2026-11-15T10:00:00.000Z',
  url: 'https://x.com/acme/status/2',
};

const otherText = {
  ...onX,
  description: 'A different post',
  id: 'x-other',
  url: 'https://x.com/acme/status/3',
};

describe('crossPostTextKey', () => {
  it.each([
    ['<p>Hello&nbsp;<b>World</b></p>', 'hello world'],
    ['  spaced\n\nout  ', 'spaced out'],
    [null, ''],
    ['a'.repeat(120), 'a'.repeat(80)],
  ])('reduces %j to %j', (description, expected) => {
    expect(crossPostTextKey(description)).toBe(expected);
  });
});

describe('findCrossPostIds', () => {
  it('finds network copies that went live within two days', () => {
    expect(
      findCrossPostIds([native], [onX, onLinkedIn, weekLater, otherText]),
    ).toEqual(['x-post', 'li-post']);
  });

  it('pairs nothing when the native post has no text', () => {
    expect(
      findCrossPostIds(
        [{ ...native, description: '' }],
        [{ ...onX, description: '' }],
      ),
    ).toEqual([]);
  });
});

describe('listCrossPosts', () => {
  it('links each network once', () => {
    expect(
      listCrossPosts(native, [
        onX,
        { ...onX, id: 'x-dup', url: 'https://x.com/acme/status/9' },
        onLinkedIn,
        { ...onLinkedIn, id: 'li-no-url', platform: 'threads', url: null },
      ]),
    ).toEqual([
      { platform: 'twitter', url: 'https://x.com/acme/status/1' },
      {
        platform: 'linkedin',
        url: 'https://www.linkedin.com/feed/update/1',
      },
    ]);
  });
});
