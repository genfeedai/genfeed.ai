import { cdnAsset } from '@helpers/media/cdn/cdn.helper';

/**
 * Stable storage identities for seeded article cards.
 *
 * Keys follow the public article slug so missing coverage fails visibly during
 * seed construction. Values are permanent asset identities: changing a title
 * or slug must preserve the existing value, and new articles receive the next
 * unused id. This keeps S3 objects and cached OG URLs independent from copy.
 */
export const ARTICLE_ARTWORK_IDS = {
  'agencies-manage-multiple-brands-ai-content-workflows': 'card-0001',
  'ai-content-approval-workflows-marketing-agencies': 'card-0002',
  'ai-image-prompt-templates': 'card-0003',
  'automate-cross-platform-content-calendar': 'card-0004',
  'best-ai-content-creation-tools-social-media': 'card-0005',
  'best-ai-content-repurposing-tools': 'card-0006',
  'best-ai-image-generators-marketing-teams': 'card-0007',
  'best-ai-influencer-generators-brands': 'card-0008',
  'best-ai-video-generators-short-form-content': 'card-0009',
  'best-open-source-social-media-management-tools': 'card-0010',
  'best-social-listening-tools-content-creators': 'card-0011',
  'best-social-media-automation-tools-creators-agencies': 'card-0012',
  'choose-ai-model-copy-images-video-voice': 'card-0013',
  'connect-chatgpt-claude-cursor-content-stack-mcp': 'card-0014',
  'create-10-ad-variations-from-one-creative-brief': 'card-0015',
  'create-ai-video-ads-tiktok-reels-shorts': 'card-0016',
  'create-manage-ai-influencer-content-pipeline': 'card-0017',
  'how-to-build-an-ai-content-workflow': 'card-0018',
  'how-to-grow-on-instagram-with-ai-generated-content': 'card-0019',
  'how-to-grow-on-linkedin-with-ai-generated-content': 'card-0020',
  'how-to-grow-on-tiktok-with-ai-generated-content': 'card-0021',
  'how-to-grow-on-youtube-with-ai-generated-content': 'card-0022',
  'how-to-prompt-ai-content-clear-framework': 'card-0023',
  'how-to-prompt-ai-images-videos-and-audio': 'card-0024',
  'how-to-self-host-ai-content-creation-platform': 'card-0025',
  'keep-ai-generated-content-consistent-with-brand': 'card-0026',
  'make-consistent-ai-images-across-campaign': 'card-0027',
  'measure-ai-content-performance-across-social-platforms': 'card-0028',
  'repurpose-blog-post-into-video-images-social-posts': 'card-0029',
  'short-form-video-specs-tiktok-reels-shorts-linkedin': 'card-0030',
  'social-media-image-sizes-safe-zones': 'card-0031',
  'turn-podcast-into-social-media-posts-with-ai': 'card-0032',
  'turn-social-trends-into-content-workflow': 'card-0033',
  'what-is-a-content-operating-system': 'card-0034',
  'what-is-an-ai-content-agent': 'card-0035',
  'what-is-an-ai-influencer': 'card-0036',
  'what-is-social-listening-find-content-ideas': 'card-0037',
} as const;

type ArticleArtworkSlug = keyof typeof ARTICLE_ARTWORK_IDS;

export function resolveArticleArtworkId(slug: string): string {
  const artworkId = ARTICLE_ARTWORK_IDS[slug as ArticleArtworkSlug];
  if (!artworkId) {
    throw new Error(`Missing stable article artwork id for slug: ${slug}`);
  }
  return artworkId;
}

export function articleArtwork(slug: string): string {
  return cdnAsset(
    `/assets/cards/articles/${resolveArticleArtworkId(slug)}.webp`,
  );
}
