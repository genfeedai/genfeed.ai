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
};
