import type {
  TrendItem,
  TrendSourceItem,
} from '@genfeedai/props/trends/trends-page.props';
import {
  buildAgentPromptHref,
  buildPostAnalyticsHref,
  buildTrendAgentHref,
  buildTrendSourceAgentHref,
  buildTrendSourceTwitterDraftHref,
} from '@utils/url/desktop-loop-url.util';

describe('desktop-loop-url.util', () => {
  it('builds an agent prompt href', () => {
    expect(buildAgentPromptHref('Test prompt')).toBe(
      '/agent/new?prompt=Test+prompt',
    );
  });

  it('builds a contextual agent handoff for a trend', () => {
    expect(
      buildTrendAgentHref({
        platform: 'tiktok',
        topic: 'AI workflow hacks',
      }),
    ).toContain('/agent/new?prompt=');
  });

  it('preserves the exact source reference in contextual remix handoffs', () => {
    const trend: TrendItem = {
      expiresAt: '2026-07-19T00:00:00.000Z',
      growthRate: 42,
      id: 'trend-1',
      isCurrent: true,
      mentions: 1200,
      platform: 'twitter',
      requiresAuth: false,
      topic: 'Agent workflows',
      viralityScore: 88,
    };
    const source: TrendSourceItem = {
      contentType: 'tweet',
      id: 'source-1',
      platform: 'twitter',
      sourceReferenceId: 'source-reference-1',
      sourceUrl: 'https://x.com/example/status/1',
      text: 'A concrete source post',
    };

    const href = buildTrendSourceTwitterDraftHref(trend, source);

    expect(href).toContain('/posts/remix?');
    expect(href).toContain('trendId=trend-1');
    expect(href).toContain('sourceReferenceId=source-reference-1');
    expect(href).toContain(
      'sourceUrl=https%3A%2F%2Fx.com%2Fexample%2Fstatus%2F1',
    );
    expect(buildTrendSourceAgentHref(trend, source)).toContain(
      'Source+URL%3A+https%3A%2F%2Fx.com%2Fexample%2Fstatus%2F1',
    );
  });

  it('builds a post analytics href', () => {
    expect(buildPostAnalyticsHref('post-123')).toBe(
      '/analytics/posts?postId=post-123',
    );
  });
});
