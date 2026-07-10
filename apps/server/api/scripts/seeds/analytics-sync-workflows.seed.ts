/**
 * Seed Script: Analytics Sync Workflows
 *
 * Idempotently provisions default-on analytics sync workflows for existing
 * organizations. New organizations are seeded automatically on creation.
 *
 * Dry-run is the default. Pass `--live` to apply changes.
 *
 * Usage:
 *   bun run apps/server/api/scripts/seeds/analytics-sync-workflows.seed.ts
 *   bun run apps/server/api/scripts/seeds/analytics-sync-workflows.seed.ts --live
 *   bun run apps/server/api/scripts/seeds/analytics-sync-workflows.seed.ts --organizationId=<id>
 *   bun run apps/server/api/scripts/seeds/analytics-sync-workflows.seed.ts --env=production --live
 */

import { ANALYTICS_SYNC_WORKFLOW_TEMPLATES } from '@api/collections/workflows/templates/analytics-sync-workflows.template';
import { runWorkflowSeed } from './shared/run-workflow-seed';

void runWorkflowSeed({
  dryRunLabel: 'analytics sync',
  ensure: (seeder, userId, organizationId) =>
    seeder.ensureAnalyticsSyncWorkflows(userId, organizationId),
  loggerName: 'AnalyticsSyncWorkflowSeed',
  name: 'Analytics sync workflow seed',
  templates: ANALYTICS_SYNC_WORKFLOW_TEMPLATES,
});
