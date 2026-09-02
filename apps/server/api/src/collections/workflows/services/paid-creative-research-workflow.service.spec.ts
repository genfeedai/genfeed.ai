import { PaidCreativeResearchWorkflowService } from '@api/collections/workflows/services/paid-creative-research-workflow.service';
import { describe, expect, it, vi } from 'vitest';

describe('PaidCreativeResearchWorkflowService atomic actions', () => {
  it('discovers advertisers and ingests exactly one child item', async () => {
    const advertiser = {
      advertiserHandle: 'nike',
      brandId: 'brand-1',
      externalAdvertiserId: null,
      id: 'watch-1',
      organizationId: 'org-1',
      platform: 'meta',
    };
    const ingestion = {
      discoverAdvertisers: vi.fn().mockResolvedValue([advertiser]),
      getReadiness: vi.fn().mockReturnValue([{ available: true }]),
      ingestOne: vi.fn().mockResolvedValue({
        advertiserId: 'watch-1',
        recordCount: 2,
        status: 'success',
      }),
    };
    const service = new PaidCreativeResearchWorkflowService(ingestion as never);

    const discovery = await service.discoverPaidCreativeAdvertisers('org-1', {
      state: { available: true },
    });
    expect(discovery.items).toEqual([advertiser]);

    await service.ingestPaidCreativeAdvertiser('org-1', { item: advertiser });
    expect(ingestion.ingestOne).toHaveBeenCalledWith('org-1', advertiser, {});
  });
});
