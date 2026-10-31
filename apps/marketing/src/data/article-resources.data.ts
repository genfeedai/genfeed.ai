import type { ArticleResource } from '@props/content/public-article.props';

/** Editorial handoffs only: unknown/customer articles receive no promotion. */
const ARTICLE_RESOURCES: Readonly<Record<string, ArticleResource>> = {
  'how-to-prompt-ai-content-clear-framework': {
    module: 'writing',
    skill: 'blog-content-creator',
    label: 'Write a source-backed article',
  },
  'how-to-prompt-ai-images-videos-and-audio': {
    module: 'media',
    skill: 'cinematic-prompting',
    label: 'Build your visual brief',
  },
  'ai-image-prompt-templates': {
    module: 'media',
    skill: 'image-prompt-engineer',
    label: 'Create your image prompt',
  },
  'how-to-grow-on-instagram-with-ai-generated-content': {
    module: 'instagram',
    skill: 'instagram-post',
    label: 'Plan your Instagram content',
  },
  'how-to-grow-on-tiktok-with-ai-generated-content': {
    module: 'content',
    skill: 'content-atomizer',
    label: 'Turn your idea into short-form content',
  },
  'how-to-grow-on-linkedin-with-ai-generated-content': {
    module: 'linkedin',
    skill: 'linkedin-post',
    label: 'Draft your LinkedIn content',
  },
  'how-to-grow-on-youtube-with-ai-generated-content': {
    module: 'youtube',
    skill: 'youtube-content-creator',
    label: 'Develop your YouTube content',
  },
  'how-to-start-b2b-content-playbook': {
    module: 'content',
    skill: 'content-strategist',
    label: 'Plan your B2B content',
  },
  'founder-led-linkedin-b2b-playbook': {
    module: 'linkedin',
    skill: 'linkedin-post',
    label: 'Draft your founder-led LinkedIn posts',
  },
  'turn-customer-calls-into-b2b-content-playbook': {
    module: 'content',
    skill: 'content-strategist',
    label: 'Plan content from your calls',
  },
  'turn-one-case-study-into-20-b2b-assets': {
    module: 'content',
    skill: 'content-atomizer',
    label: 'Atomize your case study',
  },
  'measure-b2b-content-against-pipeline-playbook': {
    module: 'loop',
    skill: 'analytics-collector',
    label: 'Collect your post metrics',
  },
  'how-to-launch-an-open-source-product-on-show-hn-and-product-hunt': {
    module: 'writing',
    skill: 'launch-copy-creator',
    label: 'Prepare your launch copy',
  },
};

export function getArticleResource(slug: string): ArticleResource | null {
  return Object.hasOwn(ARTICLE_RESOURCES, slug)
    ? ARTICLE_RESOURCES[slug]
    : null;
}
