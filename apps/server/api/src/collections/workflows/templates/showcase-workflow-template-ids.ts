/**
 * Code-curated showcase order for `GET /workflows/templates` (#5510).
 * `featuredRank` is the 1-based index in this list. Admin pins (#5511)
 * replace the Featured row when any exist; with none pinned, the templates
 * page shows this set.
 *
 * The issue's sixth pick, TikTok Slideshow Automation, has no template.
 * `weekly-brand-ai-content-loop` is the closest runnable graph: a social
 * post with a generated image. `multi-platform-resize` and
 * `social-media-video-series` are the original picks; both complete on the
 * real engine (#5533).
 */
export const SHOWCASE_WORKFLOW_TEMPLATE_IDS = [
  'founder-x-thread',
  'multi-platform-resize',
  'daily-brand-social-publishing',
  'social-media-video-series',
  'founder-editorial-illustration',
  'weekly-brand-ai-content-loop',
  'youtube-thumbnail-script',
] as const;

export type ShowcaseWorkflowTemplateId =
  (typeof SHOWCASE_WORKFLOW_TEMPLATE_IDS)[number];
