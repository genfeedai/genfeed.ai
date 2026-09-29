/**
 * Starter templates held to a clean run on the real workflow engine and kept
 * off the known-defect baselines (#5510). They were the code-curated Featured
 * row until admin pins replaced it (#5511); the specs keep them runnable as
 * the reference graphs operators copy and pin.
 */
export const ENGINE_VERIFIED_TEMPLATE_IDS = [
  'founder-x-thread',
  'avatar-ugc-x-landscape-heygen',
  'daily-brand-social-publishing',
  'avatar-ugc-heygen',
  'founder-editorial-illustration',
  'weekly-brand-ai-content-loop',
  'youtube-thumbnail-script',
] as const;
