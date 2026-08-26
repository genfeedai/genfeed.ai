import { ListeningTopicSerializer } from '@serializers/server/social/listening-topic.serializer';
import { describe, expect, it } from 'vitest';

type SerializedDocument = {
  data: {
    attributes: Record<string, unknown>;
    id: string;
  };
};

describe('listening topic serializer collection state', () => {
  it('exposes recoverable per-source collection state', () => {
    const sources = [
      {
        collectionCursor: 'post-42',
        collectionState: 'rate_limited',
        id: 'topic-source-1',
        lastCollectedAt: '2026-08-26T09:00:00.000Z',
        lastCollectionError: 'provider returned HTTP 429',
        platform: 'twitter',
        rateLimitedAt: '2026-08-26T10:00:00.000Z',
        sourceId: 'source-1',
        topicId: 'topic-1',
      },
    ];
    const output = ListeningTopicSerializer.serialize({
      brandId: 'brand-1',
      id: 'topic-1',
      organizationId: 'org-1',
      sources,
      userId: 'user-1',
    }) as SerializedDocument;

    expect(output.data.id).toBe('topic-1');
    expect(output.data.attributes.sources).toEqual(sources);
  });
});
