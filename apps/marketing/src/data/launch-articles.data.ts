/**
 * Public launch articles that must remain discoverable even when the article
 * API is temporarily unavailable while the sitemap is generated.
 *
 * Keep this list aligned with the upserts in
 * `apps/server/api/scripts/seeds/data/launch-articles.ts`.
 */
export const launchArticleSlugs = [
  'how-to-prompt-ai-content-clear-framework',
  'how-to-prompt-ai-images-videos-and-audio',
  'ai-image-prompt-templates',
  'how-to-grow-on-instagram-with-ai-generated-content',
  'how-to-grow-on-tiktok-with-ai-generated-content',
  'how-to-grow-on-linkedin-with-ai-generated-content',
  'how-to-grow-on-youtube-with-ai-generated-content',
  'how-to-launch-an-open-source-product-on-show-hn-and-product-hunt',
] as const;
