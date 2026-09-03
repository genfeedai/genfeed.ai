import {
  ContentCampaignLifecycleAction,
  ContentCampaignStatus,
} from '@genfeedai/contracts';
import { API_ENDPOINTS } from '@genfeedai/contracts/constants';
import {
  axiosResponse,
  collectionDocument,
  installMockHttp,
  type MockHttpInstance,
  resourceDocument,
} from '@services/__mocks__/http.mock';
import {
  Campaign,
  CampaignLifecycleResult,
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

  it('reads organic performance for a reporting window', async () => {
    http.get.mockResolvedValue(
      axiosResponse(
        resourceDocument(
          {
            campaignId: CAMPAIGN_ID,
            organic: {
              views: { availablePostCount: 0, totalPostCount: 2, value: null },
            },
            windowEnd: '2026-09-02T23:59:59.999Z',
            windowStart: '2026-08-26T00:00:00.000Z',
          },
          { id: CAMPAIGN_ID, type: 'campaign-performance' },
        ),
      ),
    );

    const result = await service.getPerformance(CAMPAIGN_ID, {
      endDate: '2026-09-02',
      startDate: '2026-08-26',
    });

    expect(http.get).toHaveBeenCalledWith(`/${CAMPAIGN_ID}/performance`, {
      params: { endDate: '2026-09-02', startDate: '2026-08-26' },
    });
    expect(result.organic.views.value).toBeNull();
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

  it('maps start, pause, complete, and generate as lifecycle results', async () => {
    http.post.mockResolvedValue(
      axiosResponse(
        resourceDocument(
          {
            action: ContentCampaignLifecycleAction.START,
            campaign: {
              brandId: 'brand-1',
              id: CAMPAIGN_ID,
              name: 'Q4',
              status: ContentCampaignStatus.ACTIVE,
            },
            items: [
              {
                id: 'cpost00000001',
                kind: 'post',
                retryable: false,
                status: 'succeeded',
              },
            ],
          },
          { id: CAMPAIGN_ID, type: 'campaign-lifecycle' },
        ),
      ),
    );

    const started = await service.start(CAMPAIGN_ID);
    expect(http.post).toHaveBeenCalledWith(`/${CAMPAIGN_ID}/start`, {});
    expect(started).toBeInstanceOf(CampaignLifecycleResult);
    expect(started.campaign).toBeInstanceOf(Campaign);
    expect(started.campaign.status).toBe(ContentCampaignStatus.ACTIVE);
    expect(started.items).toHaveLength(1);

    http.post.mockResolvedValue(
      axiosResponse(
        resourceDocument(
          {
            action: ContentCampaignLifecycleAction.GENERATE,
            campaign: {
              brandId: 'brand-1',
              id: CAMPAIGN_ID,
              name: 'Q4',
              status: ContentCampaignStatus.DRAFT,
            },
            items: [],
          },
          { id: CAMPAIGN_ID, type: 'campaign-lifecycle' },
        ),
      ),
    );

    await service.generate(CAMPAIGN_ID, { credentialIds: ['ccred00000001'] });
    expect(http.post).toHaveBeenCalledWith(`/${CAMPAIGN_ID}/generate`, {
      credentialIds: ['ccred00000001'],
    });

    await service.pause(CAMPAIGN_ID);
    expect(http.post).toHaveBeenCalledWith(`/${CAMPAIGN_ID}/pause`, {});

    await service.complete(CAMPAIGN_ID);
    expect(http.post).toHaveBeenCalledWith(`/${CAMPAIGN_ID}/complete`, {});
  });

  it('maps assign and unassign as lifecycle results, not campaign rows', async () => {
    http.post.mockResolvedValue(
      axiosResponse(
        resourceDocument(
          {
            action: ContentCampaignLifecycleAction.ASSIGN,
            campaign: {
              brandId: 'brand-1',
              id: CAMPAIGN_ID,
              name: 'Q4',
              status: ContentCampaignStatus.DRAFT,
            },
            items: [
              {
                id: 'cpost00000001',
                kind: 'post',
                retryable: false,
                status: 'succeeded',
              },
            ],
          },
          { id: CAMPAIGN_ID, type: 'campaign-lifecycle' },
        ),
      ),
    );

    const assigned = await service.assignPosts(CAMPAIGN_ID, ['cpost00000001']);
    expect(assigned).toBeInstanceOf(CampaignLifecycleResult);
    expect(assigned.action).toBe(ContentCampaignLifecycleAction.ASSIGN);
    expect(assigned.items[0]?.id).toBe('cpost00000001');

    http.delete.mockResolvedValue(
      axiosResponse(
        resourceDocument(
          {
            action: ContentCampaignLifecycleAction.UNASSIGN,
            campaign: {
              brandId: 'brand-1',
              id: CAMPAIGN_ID,
              name: 'Q4',
              status: ContentCampaignStatus.DRAFT,
            },
            items: [],
          },
          { id: CAMPAIGN_ID, type: 'campaign-lifecycle' },
        ),
      ),
    );

    const unassigned = await service.unassignPosts(CAMPAIGN_ID, [
      'cpost00000001',
    ]);
    expect(unassigned).toBeInstanceOf(CampaignLifecycleResult);
    expect(http.delete).toHaveBeenCalledWith(`/${CAMPAIGN_ID}/posts`, {
      data: { postIds: ['cpost00000001'] },
    });
  });
});
