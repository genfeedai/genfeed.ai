/**
 * Genfeed Cloud help articles (category `help`) that must stay discoverable
 * even when the article API is temporarily unavailable while the sitemap is
 * generated. They replace the hosted-product pages removed from
 * docs.genfeed.ai.
 *
 * Keep this list aligned with `HELP_ARTICLES` in
 * `apps/server/api/scripts/seeds/data/help-articles.ts`.
 */
export const helpArticleSlugs = [
  'getting-started-with-genfeed-cloud',
  'how-credits-and-billing-work',
  'organizations-in-genfeed-cloud',
  'invite-your-team-roles-and-members',
  'account-and-workspace-settings',
  'brand-setup-and-brand-memory',
  'connect-your-social-accounts',
  'approval-queue-review-before-publishing',
  'using-studio-for-images-and-video',
  'connect-claude-code-or-cursor-to-genfeed-cloud-mcp',
  'genfeed-cloud-vs-self-hosted',
] as const;
