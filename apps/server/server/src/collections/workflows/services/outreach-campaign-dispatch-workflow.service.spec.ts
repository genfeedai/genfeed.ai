import { OutreachCampaignDispatchWorkflowService } from '@server/collections/workflows/services/outreach-campaign-dispatch-workflow.service';
import { CAMPAIGN_DISPATCH_ACTION_IDS } from '@server/services/campaign/campaign-dispatch-workflow-definition';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('OutreachCampaignDispatchWorkflowService', () => {
  const campaignsService = {
    findActiveForDispatch: vi.fn(),
  };
  const workflowRunner = {
    registerAction: vi.fn(),
    runWorkflowDefinition: vi.fn(),
  };
  let service: OutreachCampaignDispatchWorkflowService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new OutreachCampaignDispatchWorkflowService(
      campaignsService as never,
      workflowRunner as never,
    );
  });

  it('registers atomic discovery and finalization actions', () => {
    service.onModuleInit();

    expect(workflowRunner.registerAction).toHaveBeenCalledTimes(2);
    expect(workflowRunner.registerAction).toHaveBeenCalledWith(
      CAMPAIGN_DISPATCH_ACTION_IDS.DISCOVER,
      expect.any(Function),
    );
    expect(workflowRunner.registerAction).toHaveBeenCalledWith(
      CAMPAIGN_DISPATCH_ACTION_IDS.FINALIZE,
      expect.any(Function),
    );
  });

  it('dispatches through the multi-node campaign workflow', async () => {
    const result = {
      action: 'outreachCampaignDispatch',
      alreadyQueued: 0,
      enqueued: 2,
      failed: 0,
      organizationId: 'org-1',
      skipped: 0,
      status: 'completed',
    } as const;
    workflowRunner.runWorkflowDefinition.mockResolvedValueOnce({ result });

    await expect(service.runActiveCampaignDispatch('org-1')).resolves.toEqual(
      result,
    );
    expect(workflowRunner.runWorkflowDefinition).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        inputValues: { request: { organizationId: 'org-1' } },
        organizationId: 'org-1',
      }),
    );
  });
});
