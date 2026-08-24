/**
 * Seed Script: Outreach Campaign Dispatch Workflows
 *
 * Idempotently provisions the default-on outreach campaign dispatch workflow
 * for existing organizations. New organizations are seeded automatically on
 * creation / self-hosted backfill.
 *
 * Dry-run is the default. Pass `--live` to apply changes.
 *
 * Usage:
 *   bun run apps/server/api/scripts/seeds/outreach-campaign-dispatch-workflows.seed.ts
 *   bun run apps/server/api/scripts/seeds/outreach-campaign-dispatch-workflows.seed.ts --live
 *   bun run apps/server/api/scripts/seeds/outreach-campaign-dispatch-workflows.seed.ts --organizationId=<id>
 *   bun run apps/server/api/scripts/seeds/outreach-campaign-dispatch-workflows.seed.ts --env=production --live
 */

import { OUTREACH_CAMPAIGN_DISPATCH_WORKFLOW_TEMPLATES } from '@api/collections/workflows/templates/outreach-campaign-dispatch-workflows.template';
import { runWorkflowSeed } from './shared/run-workflow-seed';

void runWorkflowSeed({
  dryRunLabel: 'outreach campaign dispatch',
  ensure: (seeder, userId, organizationId) =>
    seeder.ensureOutreachCampaignDispatchWorkflows(userId, organizationId),
  loggerName: 'OutreachCampaignDispatchWorkflowSeed',
  name: 'Outreach campaign dispatch workflow seed',
  templates: OUTREACH_CAMPAIGN_DISPATCH_WORKFLOW_TEMPLATES,
});
