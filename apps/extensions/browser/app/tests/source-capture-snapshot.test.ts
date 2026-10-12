import { importedSourceSnapshotInputSchema } from '@genfeedai/contracts/api-types/contracts/imported-source.contract';
import { describe, expect, it } from 'vitest';
import type { RawSourceCapture } from '../src/models/imported-source.model';
import {
  buildCapturePreview,
  buildSourceSnapshot,
  classifySourceKind,
  defaultMediaIndex,
  describeMedia,
  isRawSourceCapture,
  SourceCaptureError,
} from '../src/platforms/source-capture-snapshot';

function capture(overrides: Partial<RawSourceCapture> = {}): RawSourceCapture {
  return {
    isSelection: false,
    media: [],
    scope: 'page',
    text: 'Visible page text.',
    title: 'A page',
    typeHints: [],
    url: 'https://example.com/read',
    ...overrides,
  };
}

describe('source kind classification', () => {
  it.each([
    [capture({ host: 'x' }), 'social'],
    [capture({ host: 'reddit' }), 'social'],
    [capture({ host: 'social' }), 'social'],
    [capture({ host: 'youtube' }), 'video'],
    [capture({ typeHints: ['podcastepisode'] }), 'podcast'],
    [
      capture({ url: 'https://podcasts.apple.com/us/podcast/show/id1' }),
      'podcast',
    ],
    [capture({ url: 'https://open.spotify.com/episode/abc' }), 'podcast'],
    [capture({ url: 'https://open.spotify.com/playlist/abc' }), 'page'],
    [capture({ url: 'https://writer.substack.com/p/post' }), 'newsletter'],
    [capture({ url: 'https://news.beehiiv.com/p/post' }), 'newsletter'],
    [capture({ typeHints: ['article', 'newsarticle'] }), 'article'],
    [
      capture({
        media: [
          { kind: 'audio', origin: 'element', url: 'https://x.test/a.mp3' },
        ],
        text: 'Short notes',
      }),
      'podcast',
    ],
    [capture({ text: 'x'.repeat(401) }), 'article'],
    [capture({ text: 'Short' }), 'page'],
    [
      capture({
        media: [
          { kind: 'video', origin: 'selected', url: 'https://x.test/v.mp4' },
        ],
        scope: 'media',
      }),
      'video',
    ],
  ])('classifies %#', (raw, expected) => {
    expect(classifySourceKind(raw)).toBe(expected);
  });

  it('does not trust a declared canonical on another site', () => {
    const snapshot = buildSourceSnapshot({
      raw: capture({ canonicalUrl: 'https://evil.example/phish' }),
    });
    expect(snapshot.canonicalUrl).toBe('https://example.com/read');
    const same = buildSourceSnapshot({
      raw: capture({
        canonicalUrl: 'https://www.example.com/read/canonical',
        url: 'https://example.com/read?ref=1',
      }),
    });
    expect(same.canonicalUrl).toBe('https://www.example.com/read/canonical');
  });
});

describe('media availability is honest', () => {
  const raw = capture({
    media: [
      {
        kind: 'image',
        label: 'Chart',
        origin: 'element',
        url: 'https://cdn.test/chart.png',
      },
      {
        kind: 'video',
        origin: 'player',
        url: 'https://www.youtube.com/embed/abc',
      },
      { kind: 'video', origin: 'element', url: 'https://cdn.test/clip.mp4' },
      { kind: 'video', origin: 'element', url: 'blob:https://example.com/1' },
      {
        kind: 'audio',
        origin: 'structured-data',
        url: 'https://cdn.test/ep.mp3',
      },
      { kind: 'video', origin: 'element', url: 'https://cdn.test/live.m3u8' },
      { kind: 'video', origin: 'meta', url: 'https://example.com/player/1' },
      { kind: 'audio', origin: 'link', url: 'https://cdn.test/feed' },
      { kind: 'image', origin: 'meta', url: 'https://cdn.test/og.png' },
    ],
  });

  it('marks direct files accessible, platform players embed-only and blobs unavailable', () => {
    expect(describeMedia(raw).map((item) => item.availability)).toEqual([
      'accessible',
      'embed_only',
      'accessible',
      'unavailable',
      'accessible',
      'unavailable',
      'embed_only',
      'unknown',
      'accessible',
    ]);
  });

  it('never presents a preview image as the video or audio', () => {
    const choices = describeMedia(raw);
    expect(choices[8].label).toBe('Preview image (not the video or audio)');
    expect(choices[3].url).toBe('https://example.com/read');
    expect(choices[1].note).toMatch(
      /saves the link and text, not the original video/,
    );
    expect(choices[3].note).toMatch(/cannot copy it/);
  });

  it('keeps a page unselected until the user chooses media', () => {
    expect(defaultMediaIndex(raw, 'article')).toBeNull();
    expect(defaultMediaIndex(raw, 'video')).toBe(1);
    expect(defaultMediaIndex(raw, 'podcast')).toBe(4);
    expect(defaultMediaIndex(raw, 'social')).toBe(0);
    expect(
      defaultMediaIndex(
        capture({
          media: [
            {
              kind: 'image',
              origin: 'selected',
              url: 'https://cdn.test/p.jpg',
            },
          ],
          scope: 'media',
        }),
        'image',
      ),
    ).toBe(0);
  });
});

describe('snapshot request', () => {
  it('builds a valid snapshot with provenance fields and the chosen media', () => {
    const snapshot = buildSourceSnapshot({
      mediaIndex: 0,
      raw: capture({
        author: 'Ada Lovelace',
        authorHandle: '@ada',
        externalIdentity: '123',
        host: 'x',
        media: [
          {
            kind: 'image',
            origin: 'element',
            url: 'https://pbs.twimg.com/m/a.jpg',
          },
        ],
        title: 'Hello',
        url: 'https://x.com/ada/status/123',
      }),
    });
    expect(importedSourceSnapshotInputSchema.safeParse(snapshot).success).toBe(
      true,
    );
    expect(snapshot).toMatchObject({
      authorDisplayName: 'Ada Lovelace',
      authorHandle: 'ada',
      canonicalUrl: 'https://x.com/ada/status/123',
      contentBasis: 'visible_page',
      externalIdentity: '123',
      kind: 'social',
      selectedMedia: {
        availability: 'accessible',
        kind: 'image',
        url: 'https://pbs.twimg.com/m/a.jpg',
      },
    });
  });

  it('reports a selection basis and a metadata-only basis exactly', () => {
    expect(
      buildSourceSnapshot({ raw: capture({ isSelection: true }) }).contentBasis,
    ).toBe('visible_selection');
    const link = buildSourceSnapshot({
      raw: capture({ scope: 'link', text: '', title: 'example.com' }),
    });
    expect(link.contentBasis).toBe('metadata_only');
    expect(link.capturedText).toBe('');
  });

  it('removes credentials and tracking from the saved URL and text', () => {
    const snapshot = buildSourceSnapshot({
      raw: capture({
        text: 'Call https://api.example.com/x?token=abc&id=2 with Bearer abc.def.ghi now',
        url: 'https://user:pw@example.com/read?utm_source=x&session=abc&id=7#frag',
      }),
    });
    expect(snapshot.canonicalUrl).toBe('https://example.com/read?id=7');
    expect(snapshot.capturedText).not.toContain('token=abc');
    expect(snapshot.capturedText).not.toContain('abc.def.ghi');
  });

  it('lets the user override the detected kind', () => {
    expect(
      buildSourceSnapshot({ kind: 'newsletter', raw: capture() }).kind,
    ).toBe('newsletter');
  });

  it('rejects unusable pages and stale media choices with a clear message', () => {
    expect(() =>
      buildSourceSnapshot({ raw: capture({ url: 'chrome://settings' }) }),
    ).toThrow(SourceCaptureError);
    expect(() =>
      buildSourceSnapshot({ mediaIndex: 3, raw: capture() }),
    ).toThrow(/no longer available/);
  });
});

describe('preview', () => {
  it('summarizes what will be saved without leaking more than an excerpt', () => {
    const preview = buildCapturePreview(
      capture({
        author: 'Jane',
        limitation: 'Open a single post to save it.',
        text: 'y'.repeat(900),
      }),
    );
    expect(preview).toMatchObject({
      authorLabel: 'Jane',
      basis: 'visible_page',
      host: 'example.com',
      limitation: 'Open a single post to save it.',
      title: 'A page',
    });
    expect(preview.excerpt).toHaveLength(400);
  });
});

describe('untrusted captures', () => {
  it('accepts a well-formed capture and rejects malformed ones', () => {
    expect(isRawSourceCapture(capture())).toBe(true);
    for (const bad of [
      null,
      'text',
      {},
      { ...capture(), url: 4 },
      { ...capture(), scope: 'everything' },
      { ...capture(), host: 'tiktok' },
      { ...capture(), media: [{ kind: 'file', origin: 'element', url: 'x' }] },
      {
        ...capture(),
        media: new Array(41).fill({
          kind: 'image',
          origin: 'element',
          url: 'https://a.test/1.png',
        }),
      },
      { ...capture(), typeHints: [1] },
    ]) {
      expect(isRawSourceCapture(bad)).toBe(false);
    }
  });
});
