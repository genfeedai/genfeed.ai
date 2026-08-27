import { OutreachCampaignDispatchWorkflowService } from '@server/collections/workflows/services/outreach-campaign-dispatch-workflow.service';
import { CampaignQueueService } from '@server/queues/campaign/campaign-queue.service';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('OutreachCampaignDispatchWorkflowService', () => {
  const cacheService = {
    acquireLock: vi.fn(),
    releaseLock: vi.fn(),
  };
  const logger = {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };
  const campaignQueueService = {
    dispatchActiveCampaigns: vi.fn(),
  };

  let service: OutreachCampaignDispatchWorkflowService;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    cacheService.acquireLock.mockResolvedValue(true);
    cacheService.releaseLock.mockResolvedValue(undefined);
    campaignQueueService.dispatchActiveCampaigns.mockResolvedValue({
      alreadyQueued: 0,
      enqueued: 1,
      failed: 0,
      organizationId: 'org-1',
      skipped: 0,
      status: 'completed',
    });

    service = new OutreachCampaignDispatchWorkflowService(
      cacheService as never,
      logger as never,
      campaignQueueService as unknown as CampaignQueueService,
    );
  });

  it('skips when the org lock already exists', async () => {
    cacheService.acquireLock.mockResolvedValue(false);

    const result = await service.runActiveCampaignDispatch('org-1');

    expect(result).toMatchObject({
      action: 'outreachCampaignDispatch',
      enqueued: 0,
      organizationId: 'org-1',
      reason: 'outreach_campaign_dispatch_already_running',
      status: 'skipped',
    });
    expect(campaignQueueService.dispatchActiveCampaigns).not.toHaveBeenCalled();
    expect(cacheService.releaseLock).not.toHaveBeenCalled();
  });

  it('dispatches active campaigns through the queue service scoped to the organization', async () => {
    const result = await service.runActiveCampaignDispatch('org-1');

    expect(cacheService.acquireLock).toHaveBeenCalledWith(
      'workflow-outreach-campaign-dispatch:org-1',
      60,
    );
    expect(campaignQueueService.dispatchActiveCampaigns).toHaveBeenCalledWith(
      'org-1',
    );
    expect(result).toMatchObject({
      action: 'outreachCampaignDispatch',
      enqueued: 1,
      organizationId: 'org-1',
      status: 'completed',
    });
    expect(cacheService.releaseLock).toHaveBeenCalledWith(
      'workflow-outreach-campaign-dispatch:org-1',
    );
  });

  it('skips diagnosably when the queue service is unavailable', async () => {
    service = new OutreachCampaignDispatchWorkflowService(
      cacheService as never,
      logger as never,
    );

    const result = await service.runActiveCampaignDispatch('org-1');

    expect(result).toMatchObject({
      reason: 'campaign_queue_service_unavailable',
      status: 'skipped',
    });
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('queue service unavailable'),
      expect.objectContaining({
        organizationId: 'org-1',
        reason: 'campaign_queue_service_unavailable',
      }),
    );
  });
});
