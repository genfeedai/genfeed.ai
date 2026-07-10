/**
 * Seed Script: Trend Notification Workflows
 *
 * Idempotently provisions default-on hourly/daily/weekly trend notification
 * workflows for existing organizations. New organizations are seeded
 * automatically on creation.
 *
 * Dry-run is the default. Pass `--live` to apply changes.
 *
 * Usage:
 *   bun run apps/server/api/scripts/seeds/trend-notification-workflows.seed.ts
 *   bun run apps/server/api/scripts/seeds/trend-notification-workflows.seed.ts --live
 *   bun run apps/server/api/scripts/seeds/trend-notification-workflows.seed.ts --organizationId=<id>
 *   bun run apps/server/api/scripts/seeds/trend-notification-workflows.seed.ts --env=production --live
 */

import { TREND_NOTIFICATION_WORKFLOW_TEMPLATES } from '@api/collections/workflows/templates/trend-notification-workflows.template';
import { runWorkflowSeed } from './shared/run-workflow-seed';

void runWorkflowSeed({
  dryRunLabel: 'trend notification',
  ensure: (seeder, userId, organizationId) =>
    seeder.ensureTrendNotificationWorkflows(userId, organizationId),
  loggerName: 'TrendNotificationWorkflowSeed',
  name: 'Trend notification workflow seed',
  templates: TREND_NOTIFICATION_WORKFLOW_TEMPLATES,
});
