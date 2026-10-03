import { normalizeExtensionPublication } from '@api/collections/posts/services/post-publication-capture.util';
import { publicationInsightLookupKind } from '@api/collections/posts/services/post-publication-insight-lookup.util';
import { describe, expect, it } from 'vitest';

describe('platform-aware publication lookup kind', () => {
  it.each([
    [
      'linkedin',
      'https://linkedin.com/feed/update/urn:li:activity:123?commentUrn=x',
      'reply',
    ],
    ['youtube', 'https://youtube.com/watch?v=abcdefghijk&lc=x', 'reply'],
    ['facebook', 'https://facebook.com/alice/posts/123?comment_id=x', 'reply'],
    [
      'facebook',
      'https://facebook.com/alice/posts/123?reply_comment_id=x',
      'reply',
    ],
    ['reddit', 'https://reddit.com/r/sub/comments/abc/slug/def/', 'reply'],
    ['reddit', 'https://reddit.com/comments/abc/slug/def', 'reply'],
    ['reddit', 'https://reddit.com/%72/sub/%63omments/abc/slug/def', 'reply'],
    ['reddit', 'https://reddit.com/r/sub/comments/abc/slug', 'post'],
    ['reddit', 'https://reddit.com/r/sub/comments/abc/slug/def/extra', 'post'],
    ['twitter', 'https://x.com/alice/status/123?commentUrn=x', 'post'],
    ['instagram', 'https://instagram.com/p/abc?comment_id=x', 'post'],
    ['tiktok', 'https://tiktok.com/@alice/video/123?comment_id=x', 'post'],
    ['facebook', 'https://facebook.com/alice/posts/123?lc=x', 'post'],
  ] as const)('classifies %s %s as %s', (platform, pageUrl, expected) => {
    expect(publicationInsightLookupKind(platform, pageUrl)).toBe(expected);
  });
  it.each([
    [
      'linkedin',
      'https://linkedin.com/feed/update/urn:li:activity:123?commentUrn=',
    ],
    [
      'linkedin',
      'https://linkedin.com/feed/update/urn:li:activity:123?commentUrn=x&commentUrn=y',
    ],
    ['youtube', 'https://youtube.com/watch?v=abcdefghijk&lc='],
    ['youtube', 'https://youtube.com/watch?v=abcdefghijk&lc=x&lc=y'],
    ['facebook', 'https://facebook.com/alice/posts/123?comment_id='],
    [
      'facebook',
      'https://facebook.com/alice/posts/123?comment_id=x&comment_id=y',
    ],
    ['facebook', 'https://facebook.com/alice/posts/123?reply_comment_id='],
    [
      'facebook',
      'https://facebook.com/alice/posts/123?reply_comment_id=x&reply_comment_id=y',
    ],
    ['reddit', 'https://reddit.com/r/sub/comments/abc/slug/bad%2Fid'],
    ['reddit', 'https://reddit.com/comments/abc/slug/!'],
  ] as const)(
    'keeps malformed reply %s for canonical rejection',
    (platform, url) => {
      const publicationKind = publicationInsightLookupKind(platform, url);
      expect(publicationKind).toBe('reply');
      expect(() =>
        normalizeExtensionPublication({ platform, publicationKind, url }),
      ).toThrow();
    },
  );
  it('propagates malformed URLs and Reddit escapes', () => {
    expect(() => publicationInsightLookupKind('twitter', 'invalid')).toThrow();
    expect(() =>
      publicationInsightLookupKind(
        'reddit',
        'https://reddit.com/comments/abc/slug/%ZZ',
      ),
    ).toThrow();
  });
});
