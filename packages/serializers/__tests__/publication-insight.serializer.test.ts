import { PublicationInsightSerializer } from '@serializers/server/content/publication-insight.serializer';
import { expect, it } from 'vitest';

it.each(['private', 'unknown'])(
  'serializes honest metrics and %s visibility without persistence secrets',
  (observedVisibility) => {
    const row = {
      id: 'post',
      organizationId: 'org',
      brandId: 'brand',
      source: 'extension',
      platform: 'twitter',
      description: 'saved',
      publicationDate: null,
      isCapturedObservation: true,
      publicationKind: 'reply',
      externalId: null,
      url: null,
      contextUrl: 'https://twitter.com/alice/status/123',
      urlKind: 'context-only',
      urlIdentity: null,
      observedVisibility,
      credentialId: null,
      analyticsAvailability: 'missing-external-id',
      collectionState: 'unavailable',
      collectionMessage: 'safe',
      latestSample: {
        date: '2026-01-01',
        updatedAt: '2026-01-02',
        metrics: {
          views: { value: null, availability: 'unavailable' },
          likes: { value: 0, availability: 'observed' },
        },
      },
      linkCandidates: [],
      targetSettings: { secret: 'SECRET' },
      author: { externalId: 'PRIVATE' },
      accessToken: 'TOKEN',
      userId: 'provider-user',
      analyticsCollectionError: { body: 'raw-provider' },
    };
    const serialized = PublicationInsightSerializer.serialize(row);
    expect(serialized).toMatchObject({
      data: {
        id: 'post',
        type: 'publication-insight',
        attributes: {
          observedVisibility,
          latestSample: row.latestSample,
          contextUrl: row.contextUrl,
        },
      },
    });
    const json = JSON.stringify(serialized);
    for (const forbidden of [
      'targetSettings',
      'author',
      'accessToken',
      'userId',
      'analyticsCollectionError',
      'SECRET',
      'PRIVATE',
      'TOKEN',
      'raw-provider',
    ])
      expect(json).not.toContain(forbidden);
  },
);
