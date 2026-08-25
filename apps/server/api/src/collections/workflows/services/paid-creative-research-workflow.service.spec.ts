import { PaidCreativeResearchWorkflowService } from '@api/collections/workflows/services/paid-creative-research-workflow.service';

/**
 * #3537: the scheduled node must distinguish "no provider could be reached"
 * from "the run completed and found nothing" — an empty result written as a
 * completed run would silently claim competitors stopped advertising.
 */
describe('PaidCreativeResearchWorkflowService', () => {
  const unavailableReadiness = [
    {
      available: false,
      blockers: ['paid_creative_apify_token_missing'],
      documentationUrl: 'https://www.facebook.com/ads/library/',
      platform: 'meta',
      provider: 'meta_ads_library',
      status: 'unavailable',
    },
    {
      available: false,
      blockers: ['x_ads_repository_contract_fixtures_missing'],
      documentationUrl:
        'https://business.x.com/en/help/ads-policies/product-policies/ads-transparency',
      platform: 'x',
      provider: 'x_ads_repository',
      status: 'unavailable',
    },
  ];

  it('skips before ingestion when no platform adapter is ready', async () => {
    const ingestionService = {
      getReadiness: vi.fn().mockReturnValue(unavailableReadiness),
      ingestForAccount: vi.fn(),
    };
    const service = new PaidCreativeResearchWorkflowService(
      ingestionService as never,
    );

    await expect(
      service.runPaidCreativeResearchIngestion('org-1'),
    ).resolves.toEqual({
      action: 'paidCreativeResearchIngestion',
      advertisersChecked: 0,
      errors: 0,
      organizationId: 'org-1',
      reason: 'paid_creative_apify_token_missing',
      recordsIngested: 0,
      skipped: 1,
      status: 'skipped',
    });
    expect(ingestionService.ingestForAccount).not.toHaveBeenCalled();
  });

  it('runs ingestion and aggregates per-advertiser outcomes when at least one adapter is ready', async () => {
    const ingestionService = {
      getReadiness: vi.fn().mockReturnValue([
        {
          available: true,
          blockers: [],
          documentationUrl: 'https://www.facebook.com/ads/library/',
          platform: 'meta',
          provider: 'meta_ads_library',
          status: 'available',
        },
        ...unavailableReadiness,
      ]),
      ingestForAccount: vi.fn().mockResolvedValue([
        {
          advertiserId: 'a1',
          platform: 'meta',
          recordCount: 12,
          status: 'success',
        },
        {
          advertiserId: 'a2',
          errorCode: 'x_ads_repository_contract_fixtures_missing',
          platform: 'x',
          recordCount: 0,
          status: 'unavailable',
        },
        {
          advertiserId: 'a3',
          errorCode: 'paid_creative_snapshot_write_failed',
          platform: 'tiktok',
          recordCount: 0,
          status: 'error',
        },
      ]),
    };
    const service = new PaidCreativeResearchWorkflowService(
      ingestionService as never,
    );

    await expect(
      service.runPaidCreativeResearchIngestion('org-1'),
    ).resolves.toEqual({
      action: 'paidCreativeResearchIngestion',
      advertisersChecked: 3,
      errors: 1,
      organizationId: 'org-1',
      recordsIngested: 12,
      skipped: 1,
      status: 'completed',
    });
    expect(ingestionService.ingestForAccount).toHaveBeenCalledWith('org-1');
  });
});
