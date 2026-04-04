import { describe, expect, it } from 'vitest';

import {
  buildRunIdempotencyKey,
  extractAnalyticsSnapshot,
  extractGeneratedPreview,
  extractPostResults,
  summarizeRunHistory,
} from '~components/create/content-engine.utils';

describe('content-engine utils', () => {
  it('buildRunIdempotencyKey is stable for identical input', () => {
    const input = {
      payload: 'Ship this post',
      platform: 'twitter',
    };

    const first = buildRunIdempotencyKey('post', input, 'brand_1');
    const second = buildRunIdempotencyKey('post', input, 'brand_1');

    expect(first).toBe(second);
    expect(first.startsWith('ext:post:')).toBe(true);
  });

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

  it('summarizeRunHistory counts generated and post outcomes', () => {
    const summary = summarizeRunHistory([
      {
        actionType: 'generate',
        progress: 100,
        status: 'completed',
      },
      {
        actionType: 'post',
        progress: 100,
        status: 'completed',
      },
      {
        actionType: 'post',
        progress: 100,
        status: 'failed',
      },
    ]);

    expect(summary.generated).toBe(1);
    expect(summary.published).toBe(1);
    expect(summary.failedPosts).toBe(1);
  });
});
