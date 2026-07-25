/**
 * Ratchet baseline for check-relation-alias-reads.ts.
 *
 * Per-file counts of pre-existing relation-alias reads, captured 2026-07-24.
 * Counts may ONLY go down — the guard fails on a file that gains one, and also
 * on a file that drops below its entry, so whoever fixes a site prunes the
 * number in the same PR. Regenerate with:
 *
 *   bun run check:relation-alias-reads --update-baseline
 *
 * When this map is empty, delete it and flip the guard to a plain ban.
 *
 * Every entry is a real instance of the defect fixed in #2033, not a false
 * positive — the backlog is large because the hazard is systemic, not because
 * the guard is noisy.
 */

export const RELATION_ALIAS_READ_BASELINE: Readonly<Record<string, number>> = {
  'apps/server/api/src/collections/agent-campaigns/controllers/agent-campaigns.controller.ts': 1,
  'apps/server/api/src/collections/agent-strategies/services/agent-strategy-autopilot-execution.service.ts': 1,
  'apps/server/api/src/collections/agent-strategies/services/agent-strategy-autopilot-performance.service.ts': 2,
  'apps/server/api/src/collections/articles/controllers/articles.controller.ts': 2,
  'apps/server/api/src/collections/articles/services/articles-content.service.ts': 1,
  'apps/server/api/src/collections/bots/services/bots-livestream-delivery.service.ts': 1,
  'apps/server/api/src/collections/content-plan-items/services/content-plan-items.service.ts': 3,
  'apps/server/api/src/collections/images/controllers/operations/images-operations.controller.ts': 1,
  'apps/server/api/src/collections/ingredients/controllers/ingredients-relationships.controller.ts': 1,
  'apps/server/api/src/collections/outreach-campaigns/controllers/outreach-campaigns.controller.ts': 3,
  'apps/server/api/src/collections/posts/controllers/operations/posts-operations.controller.ts': 5,
  'apps/server/api/src/collections/posts/services/posts.service.ts': 1,
  'apps/server/api/src/collections/prompts/controllers/prompts-operations.controller.ts': 7,
  'apps/server/api/src/collections/runs/services/runs.service.ts': 2,
  'apps/server/api/src/collections/streaks/services/streaks.service.ts': 2,
  'apps/server/api/src/collections/trainings/controllers/trainings.controller.ts': 2,
  'apps/server/api/src/collections/users/services/user-setup.service.ts': 1,
  'apps/server/api/src/collections/videos/controllers/batch-interpolation.controller.ts': 1,
  'apps/server/api/src/collections/videos/controllers/transformations/edits/videos-edits.controller.ts': 2,
  'apps/server/api/src/collections/videos/controllers/transformations/effects/videos-effects.controller.ts': 2,
  'apps/server/api/src/collections/videos/services/video-generation.service.ts': 3,
  'apps/server/api/src/collections/workflow-executions/controllers/internal-workflow-executions.controller.ts': 1,
  'apps/server/api/src/collections/workflows/services/workflow-webhook.service.ts': 2,
  'apps/server/api/src/endpoints/dev/dev.controller.ts': 1,
  'apps/server/api/src/endpoints/webhooks/replicate/webhooks.replicate.controller.ts': 1,
  'apps/server/api/src/endpoints/webhooks/services/post-processing-orchestrator.service.ts': 3,
  'apps/server/api/src/endpoints/webhooks/stripe/handlers/stripe-invoice-webhook.handler.ts': 2,
  'apps/server/api/src/endpoints/webhooks/stripe/handlers/stripe-subscription-webhook.handler.ts': 10,
  'apps/server/api/src/endpoints/webhooks/webhooks.service.ts': 2,
  'apps/server/api/src/services/integrations/facebook/controllers/facebook.controller.ts': 1,
  'apps/server/api/src/services/integrations/fanvue/controllers/fanvue.controller.ts': 1,
  'apps/server/api/src/services/integrations/google-ads/controllers/google-ads.controller.ts': 1,
  'apps/server/api/src/services/integrations/google-search-console/controllers/google-search-console.controller.ts': 1,
  'apps/server/api/src/services/integrations/instagram/controllers/instagram.controller.ts': 1,
  'apps/server/api/src/services/integrations/linkedin/controllers/linkedin.controller.ts': 1,
  'apps/server/api/src/services/integrations/medium/controllers/medium.controller.ts': 1,
  'apps/server/api/src/services/integrations/reddit/controllers/reddit.controller.ts': 2,
  'apps/server/api/src/services/integrations/threads/controllers/threads.controller.ts': 1,
  'apps/server/api/src/services/integrations/tiktok/controllers/tiktok.controller.ts': 1,
  'apps/server/api/src/services/integrations/twitter/controllers/twitter.controller.ts': 1,
  'apps/server/api/src/services/integrations/twitter/services/twitter.service.ts': 1,
  'apps/server/api/src/services/integrations/youtube/controllers/youtube.controller.ts': 2,
  'apps/server/workers/src/crons/ad-sync/cron.ad-sync-meta.service.ts': 2,
  'apps/server/workers/src/crons/credentials/cron.credentials.service.ts': 2,
  'apps/server/workers/src/crons/youtube/cron.youtube-status.service.ts': 4,
};
