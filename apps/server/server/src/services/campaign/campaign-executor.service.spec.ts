import {
  CampaignPlatform,
  CampaignStatus,
  CampaignType,
} from '@genfeedai/enums';
import { CampaignExecutorService } from '@server/services/campaign/campaign-executor.service';
import { CAMPAIGN_REPLY_ACTION_IDS } from '@server/services/campaign/campaign-reply-workflow-definition';

describe('CampaignExecutorService workflow boundary', () => {
  const runner = {
    registerAction: vi.fn(),
    registerWorkflow: vi.fn(),
    runWorkflowDefinition: vi.fn(),
  };
  const service = new CampaignExecutorService(
    { error: vi.fn(), log: vi.fn() } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    runner as never,
  );

  beforeEach(() => vi.clearAllMocks());

  it('registers the target graph and every atomic action', () => {
    service.onModuleInit();

    expect(runner.registerWorkflow).toHaveBeenCalledTimes(2);
    expect(runner.registerAction).toHaveBeenCalledTimes(
      Object.keys(CAMPAIGN_REPLY_ACTION_IDS).length,
    );
  });

  it('durably dispatches pending targets through the batch workflow', async () => {
    runner.runWorkflowDefinition.mockResolvedValueOnce({
      result: { count: 3, results: [] },
    });

    const result = await service.processPendingTargets(
      {
        campaignType: CampaignType.MANUAL,
        id: 'campaign-1',
        organizationId: 'org-1',
        platform: CampaignPlatform.TWITTER,
        status: CampaignStatus.ACTIVE,
        userId: 'user-1',
      } as never,
      3,
    );

    expect(result).toEqual({
      failed: 0,
      processed: 3,
      skipped: 0,
      successful: 0,
    });
    expect(runner.runWorkflowDefinition).toHaveBeenCalledWith(
      expect.objectContaining({
        canonicalId: 'campaign.reply.process-pending-targets',
      }),
      expect.objectContaining({
        inputValues: {
          request: {
            campaignId: 'campaign-1',
            limit: 3,
            organizationId: 'org-1',
          },
        },
      }),
    );
  });
});
