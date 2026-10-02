import { describe, expect, it } from 'vitest';
import { getArticleResource } from './article-resources.data';

describe('article resource handoffs', () => {
  it('maps the published guides to relevant existing skills', () => {
    expect(
      getArticleResource('how-to-prompt-ai-images-videos-and-audio')?.skill,
    ).toBe('cinematic-prompting');
    expect(
      getArticleResource('how-to-grow-on-tiktok-with-ai-generated-content')
        ?.skill,
    ).toBe('content-atomizer');
    expect(
      getArticleResource(
        'how-to-launch-an-open-source-product-on-show-hn-and-product-hunt',
      )?.skill,
    ).toBe('launch-copy-creator');
  });
  it('does not invent a skill or CTA for arbitrary tenant articles', () => {
    expect(getArticleResource('a-customer-announcement')).toBeNull();
  });
});
