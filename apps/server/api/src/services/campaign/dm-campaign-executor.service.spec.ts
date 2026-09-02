import { CAMPAIGN_DM_ACTION_IDS } from '@api/services/campaign/campaign-dm-workflow-definition';
import { DmCampaignExecutorService } from '@api/services/campaign/dm-campaign-executor.service';
import {
  CampaignPlatform,
  CampaignStatus,
  CampaignType,
} from '@genfeedai/contracts';

describe('DmCampaignExecutorService workflow boundary', () => {
  const runner = {
    registerAction: vi.fn(),
    registerWorkflow: vi.fn(),
    runWorkflow: vi.fn(),
  };
  const service = new DmCampaignExecutorService(
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
      Object.keys(CAMPAIGN_DM_ACTION_IDS).length,
    );
  });

  it('durably dispatches pending targets through the batch workflow', async () => {
    runner.runWorkflow.mockResolvedValueOnce({
      result: { count: 2, results: [] },
    });

    const result = await service.processPendingDmTargets(
      {
        campaignType: CampaignType.DM_OUTREACH,
        id: 'campaign-1',
        organizationId: 'org-1',
        platform: CampaignPlatform.TWITTER,
        status: CampaignStatus.ACTIVE,
        userId: 'user-1',
      } as never,
      2,
    );

    expect(result).toEqual({
      failed: 0,
      processed: 2,
      skipped: 0,
      successful: 0,
    });
    expect(runner.runWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        canonicalId: 'campaign.dm.process-pending-targets',
        inputValues: {
          request: {
            campaignId: 'campaign-1',
            limit: 2,
            organizationId: 'org-1',
          },
        },
      }),
    );
  });
});
