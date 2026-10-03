import { AnalyticsMetricAvailability } from '@genfeedai/contracts/enums/analytics-metric-availability.enum';
import { TargetAnalyticsCollectionState } from '@genfeedai/contracts/enums/scheduler.enum';
import type { PublicationInsight } from '@genfeedai/contracts/interfaces/content/publication-insights.interface';
import type { ExtensionWorkspaceSnapshot } from '@genfeedai/contracts/interfaces/extension/extension-workspace.interface';

const snapshot: ExtensionWorkspaceSnapshot = {
  userId: 'user-1',
  organizationId: 'org-1',
  organizationLabel: 'Org',
  brandId: 'brand-1',
  revision: 1,
  isApiKey: false,
  brands: [],
  organizations: [],
};
function insight(patch: Partial<PublicationInsight> = {}): PublicationInsight {
  return {
    id: 'post-1',
    organizationId: 'org-1',
    brandId: 'brand-1',
    source: 'extension',
    platform: 'twitter',
    description: 'Original reply',
    publicationDate: '2026-10-01T00:00:00.000Z',
    isCapturedObservation: true,
    publicationKind: 'reply',
    externalId: '123',
    url: 'https://x.com/author/status/123',
    contextUrl: null,
    urlKind: 'permalink',
    urlIdentity: { kind: 'platform-publication-id', value: '123' },
    observedVisibility: 'unknown',
    credentialId: null,
    analyticsAvailability: 'eligible',
    collectionState: TargetAnalyticsCollectionState.READY,
    collectionMessage: null,
    latestSample: {
      date: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-02T00:00:00.000Z',
      metrics: {
        views: { value: 0, availability: AnalyticsMetricAvailability.OBSERVED },
        likes: {
          value: null,
          availability: AnalyticsMetricAvailability.UNAVAILABLE,
        },
        comments: {
          value: null,
          availability: AnalyticsMetricAvailability.UNAUTHORIZED,
        },
        shares: {
          value: null,
          availability: AnalyticsMetricAvailability.EXPIRED,
        },
        saves: {
          value: null,
          availability: AnalyticsMetricAvailability.FAILED,
        },
      },
    },
    linkCandidates: [{ id: 'account-1', label: 'Original account' }],
    ...patch,
  };
}

import { describe, expect, it } from 'vitest';
import {
  parsePublicationInsight,
  resolvePublicationInsightPage,
} from '~services/publication-insights-validation';

describe('exact publication identity', () => {
  it.each([
    [
      'twitter',
      'https://www.x.com/a/status/123/?utm_source=test#hash',
      'https://www.x.com/a/status/123/',
    ],
    [
      'linkedin',
      'https://linkedin.com/feed/update/urn:li:activity:123?commentUrn=urn%3Ali%3Acomment%3A999&utm=x',
      'https://linkedin.com/feed/update/urn:li:activity:123?commentUrn=urn%3Ali%3Acomment%3A999',
    ],
    [
      'linkedin',
      'https://linkedin.com/posts/author_activity-123-token',
      'https://linkedin.com/posts/author_activity-123-token',
    ],
    [
      'reddit',
      'https://old.reddit.com/r/dev/comments/ab12/title/cd34?utm=x',
      'https://old.reddit.com/r/dev/comments/ab12/title/cd34',
    ],
    [
      'reddit',
      'https://reddit.com/comments/ab12/title',
      'https://reddit.com/comments/ab12/title',
    ],
    [
      'youtube',
      'https://youtube.com/watch?v=video&lc=reply&utm=x',
      'https://youtube.com/watch?lc=reply&v=video',
    ],
    ['youtube', 'https://youtu.be/video', 'https://youtu.be/video'],
    [
      'youtube',
      'https://youtube.com/shorts/video',
      'https://youtube.com/shorts/video',
    ],
    [
      'instagram',
      'https://instagram.com/reel/ABC_-123',
      'https://instagram.com/reel/ABC_-123',
    ],
    [
      'facebook',
      'https://facebook.com/story.php?story_fbid=post&id=actor&comment_id=comment&reply_comment_id=reply&utm=x',
      'https://facebook.com/story.php?comment_id=comment&id=actor&reply_comment_id=reply&story_fbid=post',
    ],
    [
      'facebook',
      'https://facebook.com/a/posts/token',
      'https://facebook.com/a/posts/token',
    ],
    [
      'tiktok',
      'https://tiktok.com/@author/video/123',
      'https://tiktok.com/@author/video/123',
    ],
  ])('preserves %s publication/reply URL', (platform, url, pageUrl) =>
    expect(resolvePublicationInsightPage(url)).toEqual({ platform, pageUrl }),
  );
  it.each([
    'http://x.com/a/status/1',
    'https://user@x.com/a/status/1',
    'https://evil.x.com/a/status/1',
    'https://x.com:444/a/status/1',
    'https://x.com/a/status/1//',
    'https://x.com/a%2Fb/status/1',
    'https://x.com/%ZZ/status/1',
    'https://x.com/home',
    'https://x.com/compose/post',
    'https://linkedin.com/feed',
    'https://reddit.com/r/a/comments/ab/title/comment/extra',
    'https://youtube.com/watch?v=a&v=b',
    'https://youtube.com/watch?v=a&lc=',
    'https://linkedin.com/feed/update/urn:li:activity:1?commentUrn=',
    'https://linkedin.com/feed/update/urn:li:activity:1?commentUrn=1',
    'https://facebook.com/posts/token?comment_id=1&comment_id=2',
    'https://www.www.x.com/a/status/1',
    'https://instagram.com/p/!',
    'https://tiktok.com/a/video/1',
  ])(
    'rejects unsafe or ambiguous identity without parent fallback: %s',
    (url) => expect(resolvePublicationInsightPage(url)).toBeNull(),
  );
  it('rejects URL credentials, including passwords', () => {
    const url = new URL('https://x.com/a/status/1');
    url.username = 'fixture-user';
    url.password = 'fixture-password';
    expect(resolvePublicationInsightPage(url.href)).toBeNull();
  });
  it('rejects absent/overlong URLs', () => {
    expect(resolvePublicationInsightPage(undefined)).toBeNull();
    expect(
      resolvePublicationInsightPage(
        `https://x.com/${'a'.repeat(2050)}/status/1`,
      ),
    ).toBeNull();
  });
});
describe('strict scoped insight', () => {
  it('preserves observed zero and unavailable null; ignores additive keys', () => {
    const parsed = parsePublicationInsight(
      { ...insight(), future: 'ok' },
      snapshot,
      'twitter',
    );
    expect(parsed.latestSample?.metrics.views.value).toBe(0);
    expect(parsed.latestSample?.metrics.likes.value).toBeNull();
  });
  it.each([
    { brandId: 'other' },
    { organizationId: 'other' },
    { platform: 'facebook' },
    { id: '' },
    { publicationDate: 'bad' },
    { observedVisibility: 'published' },
    { url: 'https://evil.example/post' },
    { url: 'https://user@x.com/a/status/1' },
    { urlKind: 'context-only' },
    {
      linkCandidates: [
        { id: 'a', label: 'A' },
        { id: 'a', label: 'B' },
      ],
    },
    { description: 42 },
    { credentialId: undefined },
    { collectionState: 'made-up' },
  ])('rejects malformed required field or scope %j', (patch) =>
    expect(() =>
      parsePublicationInsight({ ...insight(), ...patch }, snapshot, 'twitter'),
    ).toThrow(),
  );
  it('rejects observed null, nonobserved zero, missing metric and nonfinite dates', () => {
    const value = insight();
    for (const metrics of [
      {
        ...value.latestSample?.metrics,
        views: { value: null, availability: 'observed' },
      },
      {
        ...value.latestSample?.metrics,
        likes: { value: 0, availability: 'unavailable' },
      },
      { views: { value: 1, availability: 'observed' } },
    ])
      expect(() =>
        parsePublicationInsight(
          { ...value, latestSample: { ...value.latestSample, metrics } },
          snapshot,
        ),
      ).toThrow();
    expect(() =>
      parsePublicationInsight(
        { ...value, latestSample: { ...value.latestSample, date: 'bad' } },
        snapshot,
      ),
    ).toThrow();
  });
  it.each([
    'source',
    'externalId',
    'credentialId',
    'publicationDate',
    'url',
    'contextUrl',
    'urlIdentity',
    'collectionMessage',
    'latestSample',
  ] as const)(
    'rejects missing or undefined required nullable field %s',
    (field) => {
      const value: Record<string, unknown> = { ...insight() };
      value[field] = undefined;
      expect(() => parsePublicationInsight(value, snapshot)).toThrow();
      delete value[field];
      expect(() => parsePublicationInsight(value, snapshot)).toThrow();
    },
  );
  it.each(['observed', 'unavailable'])(
    'rejects missing nested metric value for %s',
    (availability) => {
      const value = insight();
      expect(() =>
        parsePublicationInsight(
          {
            ...value,
            latestSample: {
              ...value.latestSample,
              metrics: {
                ...value.latestSample?.metrics,
                views: { availability },
              },
            },
          },
          snapshot,
        ),
      ).toThrow();
    },
  );
  it('accepts safe context-only/private sampleless records truthfully', () => {
    const parsed = parsePublicationInsight(
      insight({
        url: null,
        contextUrl: 'https://x.com/a/status/parent',
        urlKind: 'context-only',
        observedVisibility: 'private',
        latestSample: null,
      }),
      snapshot,
    );
    expect(parsed.url).toBeNull();
    expect(parsed.observedVisibility).toBe('private');
  });
});
