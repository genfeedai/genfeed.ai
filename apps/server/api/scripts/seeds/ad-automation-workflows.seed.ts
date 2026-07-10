/**
 * Seed Script: Ad Automation Workflows
 *
 * Idempotently provisions default-on ad automation workflows for existing
 * organizations. New organizations are seeded automatically on creation.
 *
 * Dry-run is the default. Pass `--live` to apply changes.
 *
 * Usage:
 *   bun run apps/server/api/scripts/seeds/ad-automation-workflows.seed.ts
 *   bun run apps/server/api/scripts/seeds/ad-automation-workflows.seed.ts --live
 *   bun run apps/server/api/scripts/seeds/ad-automation-workflows.seed.ts --organizationId=<id>
 *   bun run apps/server/api/scripts/seeds/ad-automation-workflows.seed.ts --env=production --live
 */

import { AD_AUTOMATION_WORKFLOW_TEMPLATES } from '@api/collections/workflows/templates/ad-automation-workflows.template';
import { runWorkflowSeed } from './shared/run-workflow-seed';

void runWorkflowSeed({
  dryRunLabel: 'ad automation',
  ensure: (seeder, userId, organizationId) =>
    seeder.ensureAdAutomationWorkflows(userId, organizationId),
  loggerName: 'AdAutomationWorkflowSeed',
  name: 'Ad automation workflow seed',
  templates: AD_AUTOMATION_WORKFLOW_TEMPLATES,
});
