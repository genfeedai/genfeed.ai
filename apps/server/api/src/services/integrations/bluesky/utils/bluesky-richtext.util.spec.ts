import {
  buildBlueskyFacets,
  detectBlueskyFacetSpans,
} from '@api/services/integrations/bluesky/utils/bluesky-richtext.util';
import { describe, expect, it } from 'vitest';

const resolveNothing = async (): Promise<string | null> => null;

describe('detectBlueskyFacetSpans', () => {
  it('finds a link and drops the punctuation that ends the sentence', () => {
    const text = 'Read https://example.com/post. Then reply.';

    expect(detectBlueskyFacetSpans(text)).toEqual([
      {
        end: 5 + 'https://example.com/post'.length,
        kind: 'link',
        start: 5,
        value: 'https://example.com/post',
      },
    ]);
  });

  it('keeps a closing parenthesis that belongs to the link', () => {
    const [span] = detectBlueskyFacetSpans('See https://example.com/a_(b) now');

    expect(span.value).toBe('https://example.com/a_(b)');
  });

  it('drops a closing parenthesis that wraps the link', () => {
    const [span] = detectBlueskyFacetSpans('(see https://example.com/a)');

    expect(span.value).toBe('https://example.com/a');
  });

  it('finds a handle that looks like a domain and ignores an email address', () => {
    const spans = detectBlueskyFacetSpans(
      'Thanks @Alice.bsky.social, mail bob@example.com',
    );

    expect(spans).toEqual([
      { end: 25, kind: 'mention', start: 7, value: 'alice.bsky.social' },
    ]);
  });

  it('finds hashtags and strips trailing punctuation', () => {
    expect(detectBlueskyFacetSpans('Launch day #shipit!')).toEqual([
      { end: 18, kind: 'tag', start: 11, value: 'shipit' },
    ]);
  });

  it('does not treat a number-only hashtag as a tag', () => {
    expect(detectBlueskyFacetSpans('Ranked #1 today')).toEqual([]);
  });
});

describe('buildBlueskyFacets', () => {
  it('counts UTF-8 bytes, not string characters, for the offsets', async () => {
    // "é" is 2 bytes and the emoji is 4 bytes, so the link starts at byte 10.
    const text = 'é🙂 ok https://example.com';

    const facets = await buildBlueskyFacets(text, resolveNothing);

    expect(facets).toEqual([
      {
        features: [
          {
            $type: 'app.bsky.richtext.facet#link',
            uri: 'https://example.com',
          },
        ],
        index: { byteEnd: 10 + 'https://example.com'.length, byteStart: 10 },
      },
    ]);
  });

  it('adds a mention only when the handle resolves to a DID', async () => {
    const facets = await buildBlueskyFacets(
      'hi @known.example.com and @unknown.example.com',
      async (handle) =>
        handle === 'known.example.com' ? 'did:plc:abc123' : null,
    );

    expect(facets).toEqual([
      {
        features: [
          {
            $type: 'app.bsky.richtext.facet#mention',
            did: 'did:plc:abc123',
          },
        ],
        index: { byteEnd: 21, byteStart: 3 },
      },
    ]);
  });

  it('returns no facets for plain text', async () => {
    expect(await buildBlueskyFacets('Just words.', resolveNothing)).toEqual([]);
  });
});
