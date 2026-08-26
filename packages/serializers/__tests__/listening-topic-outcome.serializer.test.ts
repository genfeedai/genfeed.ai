import { ListeningTopicOutcomeSerializer } from '@serializers/server/social/listening-topic-outcome.serializer';
import { describe, expect, it } from 'vitest';

type SerializedDocument = {
  data: {
    attributes: Record<string, unknown>;
    id: string;
  };
};

describe('listening topic outcome serializer', () => {
  it('exposes stable lifecycle ids without provider payloads', () => {
    const output = ListeningTopicOutcomeSerializer.serialize({
      actionId: 'post-1',
      brandId: 'brand-1',
      evidenceIds: ['evidence-1'],
      id: 'post-1',
      latestPostAnalyticsId: 'analytics-1',
      organizationId: 'org-1',
      publicationId: 'provider-post-1',
      releaseId: 'release-1',
      sourcePostId: 'source-post-1',
      state: 'measured',
      themeId: 'theme-1',
      topicId: 'topic-1',
    }) as SerializedDocument;

    expect(output.data.id).toBe('post-1');
    expect(output.data.attributes).toMatchObject({
      actionId: 'post-1',
      evidenceIds: ['evidence-1'],
      latestPostAnalyticsId: 'analytics-1',
      publicationId: 'provider-post-1',
      releaseId: 'release-1',
      sourcePostId: 'source-post-1',
      state: 'measured',
      themeId: 'theme-1',
      topicId: 'topic-1',
    });
    expect(output.data.attributes).not.toHaveProperty('raw');
    expect(output.data.attributes).not.toHaveProperty('metadata');
  });
});
