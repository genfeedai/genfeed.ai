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
    expect(getArticleResource('how-to-start-b2b-content-playbook')?.skill).toBe(
      'content-strategist',
    );
    expect(getArticleResource('founder-led-linkedin-b2b-playbook')?.skill).toBe(
      'linkedin-content-creator',
    );
    expect(
      getArticleResource('turn-one-case-study-into-20-b2b-assets')?.skill,
    ).toBe('content-atomizer');
    expect(
      getArticleResource('measure-b2b-content-against-pipeline-playbook')
        ?.skill,
    ).toBe('analytics-collector');
  });
  it('does not invent a skill or CTA for arbitrary tenant articles', () => {
    expect(getArticleResource('a-customer-announcement')).toBeNull();
  });
});
