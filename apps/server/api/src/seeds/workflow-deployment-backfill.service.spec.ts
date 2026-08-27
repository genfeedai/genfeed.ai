import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { WorkflowDeploymentBackfillService } from './workflow-deployment-backfill.service';

const BANNED_CLONE_MARKERS = [
  'ensureAdAutomationWorkflows',
  'ensureAgentAutopilotWorkflows',
  'ensureAnalyticsSyncWorkflows',
  'ensureCampaignOrchestrationWorkflows',
  'ensureContentLoopAutopilotWorkflows',
  'ensureContentProductionWorkflows',
  'ensureDailyTrendsDigestWorkflow',
  'ensureLivestreamBotWorkflows',
  'ensureOutreachCampaignDispatchWorkflows',
  'ensureReplyPollingWorkflows',
  'ensureSystemActionWorkflows',
  'ensureTrendNotificationWorkflows',
  'WorkflowTemplateSeederService',
  'provisionOrganizationWorkflows',
] as const;

describe('WorkflowDeploymentBackfillService', () => {
  it('does not clone system workflows on hosted SaaS deploy', () => {
    const source = readFileSync(
      resolve(__dirname, 'workflow-deployment-backfill.service.ts'),
      'utf8',
    );

    for (const marker of BANNED_CLONE_MARKERS) {
      expect(source).not.toContain(marker);
    }
  });

  it('no-ops without touching organizations', async () => {
    const logger = { log: vi.fn(), error: vi.fn() };
    const service = new WorkflowDeploymentBackfillService(logger as never);

    await expect(service.run()).resolves.toEqual({
      brandFailures: 0,
      brandsProcessed: 0,
      orgFailures: 0,
      organizationsProcessed: 0,
    });
  });
});
