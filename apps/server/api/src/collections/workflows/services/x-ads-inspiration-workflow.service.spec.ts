import { XAdsInspirationWorkflowService } from '@api/collections/workflows/services/x-ads-inspiration-workflow.service';

describe('XAdsInspirationWorkflowService', () => {
  it('fails closed before ingestion or locking while the provider contract is unavailable', async () => {
    const ingestionService = {
      getReadiness: vi.fn().mockReturnValue({
        available: false,
        blockers: ['x_ads_repository_contract_fixtures_missing'],
        documentationUrl:
          'https://business.x.com/en/help/ads-policies/product-policies/ads-transparency',
        status: 'unavailable',
      }),
      ingestForAccount: vi.fn(),
    };
    const service = new XAdsInspirationWorkflowService(
      ingestionService as never,
    );

    await expect(service.runXAdsInspirationIngestion('org-1')).resolves.toEqual(
      {
        action: 'xAdsInspirationIngestion',
        advertisersChecked: 0,
        errors: 0,
        organizationId: 'org-1',
        reason: 'x_ads_repository_contract_fixtures_missing',
        recordsIngested: 0,
        skipped: 1,
        status: 'skipped',
      },
    );
    expect(ingestionService.ingestForAccount).not.toHaveBeenCalled();
  });
});
