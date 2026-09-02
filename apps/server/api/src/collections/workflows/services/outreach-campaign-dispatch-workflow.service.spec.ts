import { OutreachCampaignDispatchWorkflowService } from '@api/collections/workflows/services/outreach-campaign-dispatch-workflow.service';
import { CAMPAIGN_DISPATCH_ACTION_IDS } from '@api/services/campaign/campaign-dispatch-workflow-definition';
import { CampaignPlatform, CampaignType } from '@genfeedai/enums';
import { describe, expect, it, vi } from 'vitest';

describe('OutreachCampaignDispatchWorkflowService atomic actions', () => {
  it('classifies active campaigns into child-workflow inputs', async () => {
    const actions = new Map<string, (request: never) => Promise<unknown>>();
    const campaigns = {
      findActiveForDispatch: vi.fn().mockResolvedValue([
        {
          campaignType: CampaignType.DM_OUTREACH,
          id: 'dm-1',
          isDeleted: false,
          organizationId: 'org-1',
          platform: CampaignPlatform.TWITTER,
        },
      ]),
    };
    const runner = {
      registerAction: vi.fn(
        (id: string, action: (request: never) => Promise<unknown>) =>
          actions.set(id, action),
      ),
    };
    const service = new OutreachCampaignDispatchWorkflowService(
      campaigns as never,
      runner as never,
    );
    service.onModuleInit();

    const discover = actions.get(CAMPAIGN_DISPATCH_ACTION_IDS.DISCOVER);
    expect(discover).toBeDefined();
    await expect(
      discover?.({
        context: { organizationId: 'org-1' },
        input: { request: {} },
      } as never),
    ).resolves.toMatchObject({
      dmItems: [{ campaignId: 'dm-1', limit: 10, organizationId: 'org-1' }],
      replyItems: [],
    });
  });
});
