import type { ArticleResource } from '@props/content/public-article.props';

/** Editorial handoffs only: unknown/customer articles receive no promotion. */
const ARTICLE_RESOURCES: Readonly<Record<string, ArticleResource>> = {
  'how-to-prompt-ai-content-clear-framework': {
    skill: 'blog-content-creator',
    label: 'Write a source-backed article',
  },
  'how-to-prompt-ai-images-videos-and-audio': {
    skill: 'cinematic-prompting',
    label: 'Build your visual brief',
  },
  'ai-image-prompt-templates': {
    skill: 'image-prompt-engineer',
    label: 'Create your image prompt',
  },
  'how-to-grow-on-instagram-with-ai-generated-content': {
    skill: 'instagram-content-creator',
    label: 'Plan your Instagram content',
  },
  'how-to-grow-on-tiktok-with-ai-generated-content': {
    skill: 'content-atomizer',
    label: 'Turn your idea into short-form content',
  },
  'how-to-grow-on-linkedin-with-ai-generated-content': {
    skill: 'linkedin-content-creator',
    label: 'Draft your LinkedIn content',
  },
  'how-to-grow-on-youtube-with-ai-generated-content': {
    skill: 'youtube-content-creator',
    label: 'Develop your YouTube content',
  },
  'how-to-launch-an-open-source-product-on-show-hn-and-product-hunt': {
    skill: 'launch-copy-creator',
    label: 'Prepare your launch copy',
  },
};

export function getArticleResource(slug: string): ArticleResource | null {
  return Object.hasOwn(ARTICLE_RESOURCES, slug)
    ? ARTICLE_RESOURCES[slug]
    : null;
}
