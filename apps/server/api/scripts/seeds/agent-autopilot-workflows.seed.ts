/**
 * Seed Script: Agent Autopilot Workflows
 *
 * Idempotently provisions default-on agent autopilot workflows for existing
 * organizations. New organizations are seeded automatically on creation.
 *
 * Dry-run is the default. Pass `--live` to apply changes.
 *
 * Usage:
 *   bun run apps/server/api/scripts/seeds/agent-autopilot-workflows.seed.ts
 *   bun run apps/server/api/scripts/seeds/agent-autopilot-workflows.seed.ts --live
 *   bun run apps/server/api/scripts/seeds/agent-autopilot-workflows.seed.ts --organizationId=<id>
 *   bun run apps/server/api/scripts/seeds/agent-autopilot-workflows.seed.ts --env=production --live
 */

import { AGENT_AUTOPILOT_WORKFLOW_TEMPLATES } from '@api/collections/workflows/templates/agent-autopilot-workflows.template';
import { runWorkflowSeed } from './shared/run-workflow-seed';

void runWorkflowSeed({
  dryRunLabel: 'agent autopilot',
  ensure: (seeder, userId, organizationId) =>
    seeder.ensureAgentAutopilotWorkflows(userId, organizationId),
  loggerName: 'AgentAutopilotWorkflowSeed',
  name: 'Agent autopilot workflow seed',
  templates: AGENT_AUTOPILOT_WORKFLOW_TEMPLATES,
});
