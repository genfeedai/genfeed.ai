import { Platform } from '@genfeedai/enums';
import type {
  TrendItem,
  TrendSourceItem,
} from '@genfeedai/props/trends/trends-page.props';
import {
  buildAgentPromptHref,
  buildClipDraftAgentHref,
  buildPostAnalyticsHref,
  buildSourcePostVariationsHref,
  buildTrendAgentHref,
  buildTrendSourceAgentHref,
  buildTrendSourceTwitterDraftHref,
  isSourcePostVariationPlatform,
} from '@utils/url/desktop-loop-url.util';

describe('desktop-loop-url.util', () => {
  it('builds an agent prompt href', () => {
    expect(buildAgentPromptHref('Test prompt')).toBe(
      '/agent/new?prompt=Test+prompt',
    );
  });

  it('keeps signed clip media URLs out of Agent prompts', () => {
    const href = buildClipDraftAgentHref({
      description: 'A launch clip',
      ingredientId: 'ingredient-1',
      mediaUrl: 'https://storage.example/clip.mp4?X-Goog-Signature=secret',
      title: 'Launch',
    });

    expect(href).toContain('Ingredient+id%3A+ingredient-1');
    expect(href).not.toContain('storage.example');
    expect(href).not.toContain('secret');
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

    expect(href).toContain('/publishing/remix?');
    expect(href).toContain('trendId=trend-1');
    expect(href).toContain('sourceReferenceId=source-reference-1');
    expect(href).toContain(
      'sourceUrl=https%3A%2F%2Fx.com%2Fexample%2Fstatus%2F1',
    );
    expect(buildTrendSourceAgentHref(trend, source)).toContain(
      'Source+URL%3A+https%3A%2F%2Fx.com%2Fexample%2Fstatus%2F1',
    );
  });

  it('narrows source-post variation platforms to existing Platform members', () => {
    expect(isSourcePostVariationPlatform(Platform.LINKEDIN)).toBe(true);
    expect(isSourcePostVariationPlatform('x')).toBe(true);
    expect(isSourcePostVariationPlatform(Platform.YOUTUBE)).toBe(false);
  });

  it('builds a post analytics href', () => {
    expect(buildPostAnalyticsHref('post-123')).toBe(
      '/analytics/posts?postId=post-123',
    );
  });

  it('builds canonical variation links for all three source surfaces', () => {
    expect(
      buildSourcePostVariationsHref({
        platform: 'linkedin',
        postId: 'post-1',
      }),
    ).toBe('/publishing/remix?platform=linkedin&postId=post-1');
    expect(
      buildSourcePostVariationsHref({
        platform: 'instagram',
        sourcePostId: 'source-post-1',
      }),
    ).toBe('/publishing/remix?platform=instagram&sourcePostId=source-post-1');
    expect(
      buildSourcePostVariationsHref({
        platform: 'twitter',
        sourceReferenceId: 'reference-1',
        trendId: 'trend-1',
      }),
    ).toBe(
      '/publishing/remix?platform=twitter&sourceReferenceId=reference-1&trendId=trend-1',
    );
  });
});
