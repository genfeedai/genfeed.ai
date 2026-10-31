import { describe, expect, it } from 'vitest';

import {
  extractAnalyticsSnapshot,
  extractGeneratedPreview,
  extractPostResults,
} from '~components/create/content-engine.utils';

describe('content-engine utils', () => {
  it('extractGeneratedPreview handles nested outputs', () => {
    const output = {
      result: {
        content: 'Generated preview content',
      },
    };

    expect(extractGeneratedPreview(output)).toBe('Generated preview content');
  });

  it('extractPostResults normalizes publish payload arrays', () => {
    const output = {
      publishedPosts: [
        {
          platform: 'twitter',
          publishedUrl: 'https://x.com/acme/status/123',
          status: 'published',
        },
      ],
    };

    const results = extractPostResults(output);

    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('published');
    expect(results[0].platform).toBe('twitter');
    expect(results[0].publishedUrl).toBe('https://x.com/acme/status/123');
  });

  it('extractPostResults recognizes create_post draft results', () => {
    expect(
      extractPostResults({ executionState: 'draft', id: 'post-1' }),
    ).toEqual([
      expect.objectContaining({ externalId: 'post-1', status: 'draft' }),
    ]);
  });

  it('extractAnalyticsSnapshot uses payload values and fallback history', () => {
    const output = {
      counts: {
        generated: 9,
        published: 6,
      },
      metrics: {
        clicks: 80,
      },
      snapshotAt: '2026-02-10T10:00:00.000Z',
    };

    const snapshot = extractAnalyticsSnapshot(output, {
      failedPosts: 1,
      generated: 3,
      published: 2,
    });

    expect(snapshot.generated).toBe(9);
    expect(snapshot.published).toBe(6);
    expect(snapshot.failed).toBe(1);
    expect(snapshot.clicks).toBe(80);
    expect(snapshot.publishSuccessRate).toBeCloseTo(85.71, 1);
    expect(snapshot.lastSnapshotAt).toBe('2026-02-10T10:00:00.000Z');
  });
});
