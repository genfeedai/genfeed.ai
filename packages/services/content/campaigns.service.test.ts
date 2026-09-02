import { API_ENDPOINTS } from '@genfeedai/constants';
import { ContentCampaignStatus } from '@genfeedai/enums';
import {
  axiosResponse,
  collectionDocument,
  installMockHttp,
  type MockHttpInstance,
  resourceDocument,
} from '@services/__mocks__/http.mock';
import {
  Campaign,
  CampaignsService,
} from '@services/content/campaigns.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const CAMPAIGN_ID = 'ccampaign0001';

describe('CampaignsService', () => {
  let service: CampaignsService;
  let http: MockHttpInstance;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new CampaignsService('campaigns-token');
    http = installMockHttp(service);
  });

  it('targets the publish content-campaign collection', () => {
    expect(API_ENDPOINTS.CAMPAIGNS).toBe('/campaigns');
  });

  it('getInstance caches per token', () => {
    const first = CampaignsService.getInstance('tok');
    expect(CampaignsService.getInstance('tok')).toBe(first);
  });

  it('lists campaigns with brand and archived filters', async () => {
    http.get.mockResolvedValue(
      axiosResponse(
        collectionDocument(
          [{ brandId: 'brand-1', id: CAMPAIGN_ID, name: 'Q4' }],
          { pagination: { limit: 15, page: 1, pages: 1, total: 1 } },
        ),
      ),
    );

    const result = await service.list({
      brandId: 'brand-1',
      includeArchived: false,
      page: 1,
    });

    expect(http.get).toHaveBeenCalledWith('', {
      params: {
        brandId: 'brand-1',
        includeArchived: false,
        page: 1,
      },
      signal: undefined,
    });
    expect(result.items[0]).toBeInstanceOf(Campaign);
    expect(result.items[0]?.id).toBe(CAMPAIGN_ID);
  });

  it('archives and restores through the collection action paths', async () => {
    http.post.mockResolvedValue(
      axiosResponse(
        resourceDocument(
          { name: 'Q4', status: ContentCampaignStatus.ARCHIVED },
          { id: CAMPAIGN_ID, type: 'campaign' },
        ),
      ),
    );

    await service.archive(CAMPAIGN_ID);
    expect(http.post).toHaveBeenCalledWith(`/${CAMPAIGN_ID}/archive`, {});

    http.post.mockResolvedValue(
      axiosResponse(
        resourceDocument(
          { name: 'Q4', status: ContentCampaignStatus.DRAFT },
          { id: CAMPAIGN_ID, type: 'campaign' },
        ),
      ),
    );

    await service.restore(CAMPAIGN_ID, ContentCampaignStatus.DRAFT);
    expect(http.post).toHaveBeenCalledWith(`/${CAMPAIGN_ID}/restore`, {
      status: ContentCampaignStatus.DRAFT,
    });
  });
});
