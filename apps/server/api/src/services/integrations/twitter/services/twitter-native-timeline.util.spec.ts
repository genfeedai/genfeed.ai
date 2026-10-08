import type { TwitterTimelineResponse } from '@api/services/integrations/twitter/services/twitter-native-timeline.types';
import { mapTwitterTimeline } from '@api/services/integrations/twitter/services/twitter-native-timeline.util';
import { TwitterResponseMapper } from '@api/services/integrations/twitter/services/twitter-response.mapper';
import { describe, expect, it } from 'vitest';

const user = { id: 'author-a', username: 'author', followersCount: 10 };
const mapper = new TwitterResponseMapper();
const result: TwitterTimelineResponse = {
  data: [
    {
      id: 'text',
      text: 'Original',
      author_id: user.id,
      organic_metrics: { impression_count: 0 },
    },
    {
      id: 'image',
      text: 'Image',
      author_id: user.id,
      attachments: { media_keys: ['photo'] },
    },
    {
      id: 'unknown',
      text: 'Unknown',
      author_id: user.id,
      attachments: { media_keys: ['missing'] },
    },
    {
      id: 'fallback-author',
      text: 'No actual ID',
      organic_metrics: { impression_count: 1000 },
    },
  ],
  includes: { media: [{ media_key: 'photo', type: 'photo' }] },
};
describe('separate native X timeline evidence mapping', () => {
  it('preserves zero, provider source, actual author proof and media identity', () => {
    const posts = mapTwitterTimeline(result, user, mapper, true);
    expect(posts[0]).toMatchObject({
      nativeFormat: 'text',
      nativeAuthorVerified: true,
      breakoutExposures: {
        impressions: {
          availability: 'observed',
          value: 0,
          scope: 'organic',
          source: 'twitter:post:organic_metrics.impression_count',
        },
      },
    });
    expect(posts[1].nativeFormat).toBe('image');
    expect(posts[1].attachmentMediaKeys).toEqual(['photo']);
    expect(posts[2].nativeFormat).toBeUndefined();
    expect(posts[3].authorId).toBe(user.id);
    expect(posts[3].nativeAuthorVerified).toBe(false);
  });
  it('retains normal display fallback without adding breakout provenance to ordinary calls', () => {
    const posts = mapTwitterTimeline(result, user, mapper, false);
    expect(posts[3]).toMatchObject({
      id: 'fallback-author',
      authorId: user.id,
      authorUsername: user.username,
      text: 'No actual ID',
    });
    for (const post of posts) {
      expect(post).not.toHaveProperty('breakoutExposures');
      expect(post).not.toHaveProperty('nativeAuthorVerified');
      expect(post).not.toHaveProperty('nativeFormat');
    }
  });
});
