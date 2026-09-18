import {
  discoverHtml5Media,
  isDirectKnowledgeMediaMime,
} from '@api/collections/contexts/utils/knowledge-html5-media.util';
import { KnowledgeSourceKind } from '@genfeedai/contracts';

describe('discoverHtml5Media', () => {
  it('prefers the default caption track and resolves relative URLs', () => {
    const result = discoverHtml5Media({
      html: `
        <html>
          <body>
            <video src="/episode.mp4">
              <track kind="subtitles" src="/a.vtt" srclang="en">
              <track kind="captions" src="/b.vtt" srclang="en" default>
            </video>
          </body>
        </html>
      `,
      kind: KnowledgeSourceKind.VIDEO,
      pageUrl: 'https://media.example.com/watch',
    });
    expect(result).toEqual({
      captionUrl: 'https://media.example.com/b.vtt',
      isProhibited: false,
      mediaUrl: 'https://media.example.com/episode.mp4',
    });
  });

  it('fails closed when several unrelated media elements exist', () => {
    const result = discoverHtml5Media({
      html: `
        <video src="/one.mp4"></video>
        <video src="/two.mp4"></video>
      `,
      kind: KnowledgeSourceKind.VIDEO,
      pageUrl: 'https://media.example.com/show',
    });
    expect(result.mediaUrl).toBeUndefined();
    expect(result.reason).toMatch(/several unrelated/i);
  });

  it('marks noai pages as prohibited', () => {
    const result = discoverHtml5Media({
      html: `
        <meta name="robots" content="noai, noindex">
        <audio src="/clip.mp3"></audio>
      `,
      kind: KnowledgeSourceKind.AUDIO,
      pageUrl: 'https://media.example.com/clip',
    });
    expect(result.isProhibited).toBe(true);
  });
});

describe('isDirectKnowledgeMediaMime', () => {
  it('accepts the allowlisted audio and video types', () => {
    expect(
      isDirectKnowledgeMediaMime(
        'audio/mpeg; charset=binary',
        KnowledgeSourceKind.AUDIO,
      ),
    ).toBe(true);
    expect(
      isDirectKnowledgeMediaMime('video/mp4', KnowledgeSourceKind.VIDEO),
    ).toBe(true);
    expect(
      isDirectKnowledgeMediaMime(
        'application/octet-stream',
        KnowledgeSourceKind.VIDEO,
      ),
    ).toBe(false);
  });
});
