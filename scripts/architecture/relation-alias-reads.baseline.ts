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
  'apps/server/api/src/collections/workflow-executions/controllers/internal-workflow-executions.controller.ts': 1,
  'apps/server/api/src/collections/workflows/services/workflow-webhook.service.ts': 2,
  'apps/server/api/src/endpoints/dev/dev.controller.ts': 1,
  'apps/server/api/src/endpoints/webhooks/replicate/webhooks.replicate.controller.ts': 1,
  'apps/server/api/src/endpoints/webhooks/services/post-processing-orchestrator.service.ts': 3,
  'apps/server/api/src/endpoints/webhooks/stripe/handlers/stripe-invoice-webhook.handler.ts': 2,
  'apps/server/api/src/endpoints/webhooks/stripe/handlers/stripe-subscription-webhook.handler.ts': 10,
  'apps/server/api/src/endpoints/webhooks/webhooks.service.ts': 2,
  'apps/server/api/src/services/agent-campaign/campaign-winner-extraction.service.ts': 5,
  'apps/server/api/src/services/agent-campaign/content-engine.service.ts': 10,
  'apps/server/api/src/services/agent-campaign/trigger-evaluator.service.ts': 10,
  'apps/server/api/src/services/agent-orchestrator/agent-stream-publisher.service.ts': 1,
  'apps/server/api/src/services/agent-orchestrator/tools/agent-tool-executor.service.ts': 3,
  'apps/server/api/src/services/agent-threading/services/agent-thread-projector.service.ts': 4,
  'apps/server/api/src/services/ai-influencer/ai-influencer.service.ts': 3,
  'apps/server/api/src/services/batch-content/batch-content.service.ts': 1,
  'apps/server/api/src/services/campaign/campaign-discovery.service.ts': 1,
  'apps/server/api/src/services/campaign/campaign-executor.service.ts': 7,
  'apps/server/api/src/services/campaign/dm-campaign-executor.service.ts': 7,
  'apps/server/api/src/services/distribution/telegram/telegram-distribution.service.ts': 1,
  'apps/server/api/src/services/reply-bot/reply-bot-orchestrator.service.ts': 5,
  'apps/server/api/src/services/workflow-executor/processors/trend-inspiration.processor.ts': 1,
};
