import {
  linkedInActivityDate,
  normalizeTrackedPostLink,
  parseTrackPostLinkInput,
} from '@api/collections/posts/services/post-link-tracking.util';
import { testId } from '@helpers/testing/test-id.helper';

describe('tracked post URLs', () => {
  it.each([
    ['https://x.com/alice/status/123?s=20', 'twitter', '123'],
    ['https://twitter.com/alice/status/123', 'twitter', '123'],
    ['https://youtube.com/watch?v=abc-123', 'youtube', 'abc-123'],
    ['https://youtube.com/shorts/abc-123', 'youtube', 'abc-123'],
    ['https://youtu.be/abc-123?t=1', 'youtube', 'abc-123'],
    [
      'https://linkedin.com/posts/alice_topic-activity-123-xyz',
      'linkedin',
      null,
    ],
    ['https://linkedin.com/feed/update/urn:li:activity:123', 'linkedin', null],
    ['https://linkedin.com/feed/update/urn:li:share:123', 'linkedin', null],
    ['https://linkedin.com/feed/update/urn:li:ugcPost:123', 'linkedin', null],
    ['https://linkedin.com/pulse/hello-world-alice', 'linkedin', null],
  ])('normalizes %s', (url, platform, externalId) => {
    expect(normalizeTrackedPostLink(url)).toMatchObject({
      platform,
      externalId,
      urlKind: 'permalink',
    });
  });
  it.each([
    'https://instagram.com/p/123',
    'https://example.com/post',
    'https://x.com.evil.test/alice/status/123',
    'http://x.com/alice/status/123',
    'https://alice:secret@x.com/alice/status/123',
    'https://linkedin.com/feed/update/garbage',
    'https://linkedin.com/posts/not-a-post',
    'https://youtube.com/channel/123',
    'not a url',
  ])('rejects %s before a provider request', (url) => {
    expect(() => normalizeTrackedPostLink(url)).toThrow();
  });
  it('gives the same LinkedIn activity identity to every permalink spelling', () => {
    const a = normalizeTrackedPostLink(
      'https://linkedin.com/posts/alice_topic-activity-123-xyz',
    );
    const b = normalizeTrackedPostLink(
      'https://linkedin.com/feed/update/urn:li:activity:123/',
    );
    expect(a.urlIdentity).toEqual(b.urlIdentity);
  });
  it('preserves the article slug for idempotency', () => {
    expect(
      normalizeTrackedPostLink(
        'https://linkedin.com/pulse/hello-alice?tracking=1',
      ).urlIdentity?.value,
    ).toBe('hello-alice');
  });
  it('rejects forged scope and invalid identifiers at the shared boundary', () => {
    expect(() =>
      parseTrackPostLinkInput({
        brandId: testId('brand'),
        url: 'https://x.com/alice/status/123',
        organizationId: 'forged',
      }),
    ).toThrow();
    expect(() =>
      parseTrackPostLinkInput({
        brandId: 'invalid',
        url: 'https://x.com/alice/status/123',
      }),
    ).toThrow();
  });
});

describe('LinkedIn activity publication date', () => {
  const now = new Date('2026-10-22T10:00:00.000Z');
  it('decodes the exact timestamp', () => {
    const published = new Date('2026-02-03T04:05:06.123Z');
    const id = (BigInt(published.getTime()) << 22n).toString();
    expect(linkedInActivityDate(id, now)).toEqual(published);
  });
  it.each(['123', 'abc', undefined, '9'.repeat(30)])(
    'rejects implausible activity %s',
    (id) => {
      expect(linkedInActivityDate(id, now)).toBeNull();
    },
  );
  it('rejects a date more than five minutes ahead', () => {
    expect(
      linkedInActivityDate(
        (BigInt(now.getTime() + 300001) << 22n).toString(),
        now,
      ),
    ).toBeNull();
  });
});
