import { IngredientCategory } from '@genfeedai/enums';
import {
  buildAgentPromptHref,
  buildPostAnalyticsHref,
  buildTrendStudioHref,
  resolveTrendStudioType,
} from '@utils/url/desktop-loop-url.util';

describe('desktop-loop-url.util', () => {
  it('resolves video studio type for video-like trends', () => {
    expect(
      resolveTrendStudioType({
        metadata: { trendType: 'video' },
      }),
    ).toBe(IngredientCategory.VIDEO);
  });

  it('resolves image studio type for generic trends', () => {
    expect(
      resolveTrendStudioType({
        metadata: { trendType: 'topic' },
      }),
    ).toBe(IngredientCategory.IMAGE);
  });

  it('builds a studio href with prompt text', () => {
    expect(
      buildTrendStudioHref({
        metadata: { sampleContent: 'Fast cuts and bold captions' },
        platform: 'tiktok',
        topic: 'AI workflow hacks',
      }),
    ).toContain('/studio/image?text=');
  });

  it('builds an agent prompt href', () => {
    expect(buildAgentPromptHref('Test prompt')).toBe(
      '/chat/new?prompt=Test+prompt',
    );
  });

  it('builds a post analytics href', () => {
    expect(buildPostAnalyticsHref('post-123')).toBe(
      '/analytics/posts?postId=post-123',
    );
  });
});
