import { PaidCreativeResearchWorkflowService } from '@api/collections/workflows/services/paid-creative-research-workflow.service';
import { describe, expect, it, vi } from 'vitest';

describe('PaidCreativeResearchWorkflowService atomic actions', () => {
  it('refuses collection before discovery when paid access is missing', async () => {
    const ingestion = {
      assertCollectionAccess: vi.fn().mockResolvedValue({
        isAllowed: false,
        reason: 'research_paid_access_required',
      }),
      discoverAdvertisers: vi.fn(),
      getReadiness: vi.fn(),
      ingestOne: vi.fn(),
    };
    const service = new PaidCreativeResearchWorkflowService(ingestion as never);

    await expect(service.preparePaidCreativeResearch('org-1')).resolves.toEqual(
      {
        available: false,
        organizationId: 'org-1',
        reason: 'research_paid_access_required',
      },
    );
    expect(ingestion.discoverAdvertisers).not.toHaveBeenCalled();
    expect(ingestion.ingestOne).not.toHaveBeenCalled();
  });

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
