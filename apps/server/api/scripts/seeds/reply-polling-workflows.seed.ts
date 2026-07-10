/**
 * Seed Script: Reply Polling Workflows
 *
 * Idempotently provisions default-on reply/social polling workflows for
 * existing organizations. New organizations are seeded automatically on
 * creation.
 *
 * Dry-run is the default. Pass `--live` to apply changes.
 *
 * Usage:
 *   bun run apps/server/api/scripts/seeds/reply-polling-workflows.seed.ts
 *   bun run apps/server/api/scripts/seeds/reply-polling-workflows.seed.ts --live
 *   bun run apps/server/api/scripts/seeds/reply-polling-workflows.seed.ts --organizationId=<id>
 *   bun run apps/server/api/scripts/seeds/reply-polling-workflows.seed.ts --env=production --live
 */

import { REPLY_POLLING_WORKFLOW_TEMPLATES } from '@api/collections/workflows/templates/reply-polling-workflows.template';
import { runWorkflowSeed } from './shared/run-workflow-seed';

void runWorkflowSeed({
  dryRunLabel: 'reply polling',
  ensure: (seeder, userId, organizationId) =>
    seeder.ensureReplyPollingWorkflows(userId, organizationId),
  loggerName: 'ReplyPollingWorkflowSeed',
  name: 'Reply polling workflow seed',
  templates: REPLY_POLLING_WORKFLOW_TEMPLATES,
});
