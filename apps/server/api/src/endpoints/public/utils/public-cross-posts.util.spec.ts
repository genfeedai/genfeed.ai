import { performance } from 'node:perf_hooks';
import {
  type CrossPostCandidate,
  crossPostTextKey,
  findCrossPostIds,
  listCrossPosts,
} from '@api/endpoints/public/utils/public-cross-posts.util';
import fc from 'fast-check';
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

/** The caption key as it was computed before long captions were read in part. */
function wholeCaptionKey(description: string | null | undefined): string {
  const entities: Record<string, string> = {
    '&#39;': "'",
    '&amp;': '&',
    '&gt;': '>',
    '&lt;': '<',
    '&nbsp;': ' ',
    '&quot;': '"',
  };
  return (description ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(
      /&(?:nbsp|amp|lt|gt|quot|#39);/g,
      (entity) => entities[entity] ?? ' ',
    )
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .slice(0, 80);
}

describe('crossPostTextKey on long captions', () => {
  const pieces = fc.constantFrom(
    '<',
    '>',
    '<>',
    '&',
    '&amp;',
    '&nbsp;',
    '&lt;',
    '&gt;',
    ';',
    'a',
    'B',
    ' ',
    '\n',
    'Σ',
    'İ',
    '<b>',
    '</p>',
    '<a href="x">',
    'word ',
    '<img',
    '😀',
  );

  it('matches the whole-caption key for random markup-heavy captions', () => {
    fc.assert(
      fc.property(fc.array(pieces, { maxLength: 400 }), (parts) => {
        const caption = parts.join('');
        expect(crossPostTextKey(caption)).toBe(wholeCaptionKey(caption));
      }),
      { numRuns: 2000 },
    );
  });

  it('matches when the cut falls inside a tag or an entity', () => {
    for (const filler of ['a', '&amp;', '<b>x</b>']) {
      for (let offset = 0; offset < 12; offset += 1) {
        const caption = `${' '.repeat(offset)}${filler.repeat(60)}<a href="https://example.com/${'p'.repeat(300)}">tail &amp; more</a> ${'z'.repeat(200)}`;
        expect(crossPostTextKey(caption)).toBe(wholeCaptionKey(caption));
      }
    }
  });
});

const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;

/** The pairwise pairing this module used before it grouped by caption. */
function pairwiseCrossPostIds(
  natives: readonly CrossPostCandidate[],
  networkPosts: readonly CrossPostCandidate[],
): string[] {
  const liveAt = (post: CrossPostCandidate) => {
    const value = post.publishedAt ?? post.createdAt;
    return value ? new Date(value).getTime() : Number.NaN;
  };
  const isTwin = (a: CrossPostCandidate, b: CrossPostCandidate) => {
    const key = crossPostTextKey(a.description);
    if (!key || key !== crossPostTextKey(b.description)) return false;
    const distance = Math.abs(liveAt(a) - liveAt(b));
    return Number.isFinite(distance) && distance <= TWO_DAYS_MS;
  };
  return networkPosts
    .filter((post) => natives.some((candidate) => isTwin(candidate, post)))
    .map((post) => post.id);
}

const captionArbitrary = fc.constantFrom(
  '',
  '   ',
  'Shipped the new studio',
  '<p>Shipped the  new studio</p>',
  'shipped the new studio',
  'Something else entirely',
  'x'.repeat(100),
  `${'x'.repeat(80)}y`,
);
const timeArbitrary = fc.oneof(
  fc.integer({ max: 10 * TWO_DAYS_MS, min: 0 }).map((ms) => new Date(ms)),
  fc.constant(null),
  fc.constant(undefined),
);
const candidateArbitrary = fc.record({
  createdAt: timeArbitrary,
  description: fc.option(captionArbitrary, { nil: null }),
  platform: fc.constantFrom('genfeed', 'twitter', 'linkedin'),
  publishedAt: timeArbitrary,
  url: fc.constant('https://example.com/p'),
});

function withIds(
  posts: readonly Omit<CrossPostCandidate, 'id'>[],
  prefix: string,
): CrossPostCandidate[] {
  return posts.map((post, index) => ({ ...post, id: `${prefix}-${index}` }));
}

describe('findCrossPostIds against the pairwise pairing', () => {
  it('returns the same ids for random posts', () => {
    fc.assert(
      fc.property(
        fc.array(candidateArbitrary, { maxLength: 12 }),
        fc.array(candidateArbitrary, { maxLength: 30 }),
        (natives, network) => {
          const nativePosts = withIds(natives, 'n');
          const networkPosts = withIds(network, 'x');
          expect(findCrossPostIds(nativePosts, networkPosts)).toEqual(
            pairwiseCrossPostIds(nativePosts, networkPosts),
          );
        },
      ),
      { numRuns: 500 },
    );
  });

  it('pairs 200 native and 1,000 network posts with long captions in under 5 ms', () => {
    const natives: CrossPostCandidate[] = Array.from(
      { length: 200 },
      (_, index) => ({
        description: `<p>Post number ${index} about the studio launch, with a long caption ${'text '.repeat(40)}</p>`,
        id: `n-${index}`,
        platform: 'genfeed',
        publishedAt: new Date(Date.UTC(2026, 10, 1) + index * 3_600_000),
      }),
    );
    const networkPosts: CrossPostCandidate[] = Array.from(
      { length: 1000 },
      (_, index) => ({
        description: `Post number ${index % 400} about the studio launch, with a long caption ${'text '.repeat(40)}`,
        id: `x-${index}`,
        platform: 'twitter',
        publishedAt: new Date(
          Date.UTC(2026, 10, 1) + (index % 200) * 3_600_000,
        ),
        url: `https://x.com/acme/status/${index}`,
      }),
    );
    const expected = pairwiseCrossPostIds(natives, networkPosts);
    expect(expected.length).toBeGreaterThan(0);

    findCrossPostIds(natives, networkPosts);
    const runs: number[] = [];
    for (let run = 0; run < 15; run += 1) {
      const startedAt = performance.now();
      const ids = findCrossPostIds(natives, networkPosts);
      runs.push(performance.now() - startedAt);
      expect(ids).toEqual(expected);
    }
    runs.sort((a, b) => a - b);

    // The fastest of several runs: a busy CI machine slows a run, never speeds one.
    expect(runs[0]).toBeLessThan(5);
  });
});
