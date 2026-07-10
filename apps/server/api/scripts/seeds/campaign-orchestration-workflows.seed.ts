/**
 * Seed Script: Campaign Orchestration Workflows
 *
 * Idempotently provisions default-on campaign orchestration workflows for
 * existing organizations. New organizations are seeded automatically on
 * creation.
 *
 * Dry-run is the default. Pass `--live` to apply changes.
 *
 * Usage:
 *   bun run apps/server/api/scripts/seeds/campaign-orchestration-workflows.seed.ts
 *   bun run apps/server/api/scripts/seeds/campaign-orchestration-workflows.seed.ts --live
 *   bun run apps/server/api/scripts/seeds/campaign-orchestration-workflows.seed.ts --organizationId=<id>
 *   bun run apps/server/api/scripts/seeds/campaign-orchestration-workflows.seed.ts --env=production --live
 */

import { CAMPAIGN_ORCHESTRATION_WORKFLOW_TEMPLATES } from '@api/collections/workflows/templates/campaign-orchestration-workflows.template';
import { runWorkflowSeed } from './shared/run-workflow-seed';

void runWorkflowSeed({
  dryRunLabel: 'campaign',
  ensure: (seeder, userId, organizationId) =>
    seeder.ensureCampaignOrchestrationWorkflows(userId, organizationId),
  loggerName: 'CampaignOrchestrationWorkflowSeed',
  name: 'Campaign orchestration workflow seed',
  templates: CAMPAIGN_ORCHESTRATION_WORKFLOW_TEMPLATES,
});
