import { CampaignStatus, CampaignTargetType } from '@genfeedai/contracts';
import {
  axiosResponse,
  collectionDocument,
  installMockHttp,
  type MockHttpInstance,
  resourceDocument,
} from '@services/__mocks__/http.mock';
import {
  OutreachCampaign,
  OutreachCampaignsService,
} from '@services/automation/outreach-campaigns.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('OutreachCampaignsService', () => {
  const campaignId = 'campaign_1';
  let service: OutreachCampaignsService;
  let http: MockHttpInstance;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new OutreachCampaignsService('outreach-token');
    http = installMockHttp(service);
  });

  it('getInstance caches per token', () => {
    const first = OutreachCampaignsService.getInstance('tok');
    expect(OutreachCampaignsService.getInstance('tok')).toBe(first);
  });

  it('findAllByOrganization pages through the org scope', async () => {
    http.get.mockResolvedValue(
      axiosResponse(
        collectionDocument([{ id: campaignId, label: 'Camp' }], {
          pagination: { limit: 100, page: 1, pages: 1, total: 1 },
        }),
      ),
    );

    const result = await service.findAllByOrganization('org_1', 'brand_1');

    expect(http.get).toHaveBeenCalledWith('', {
      params: {
        brandId: 'brand_1',
        limit: 100,
        organizationId: 'org_1',
        page: 1,
      },
      signal: undefined,
    });
    expect(result[0]).toBeInstanceOf(OutreachCampaign);
  });

  it('findByStatus pages through the status filter', async () => {
    http.get.mockResolvedValue(
      axiosResponse(
        collectionDocument([], {
          pagination: { limit: 100, page: 1, pages: 1, total: 0 },
        }),
      ),
    );

    await service.findByStatus('org_1', CampaignStatus.ACTIVE);

    expect(http.get).toHaveBeenCalledWith('', {
      params: {
        limit: 100,
        organizationId: 'org_1',
        page: 1,
        status: 'active',
      },
      signal: undefined,
    });
  });

  describe('status transitions', () => {
    it.each([
      ['start', 'active'],
      ['pause', 'paused'],
      ['complete', 'completed'],
    ] as const)('%s PATCHes status %s', async (method, status) => {
      http.patch.mockResolvedValue(
        axiosResponse(resourceDocument({ status }, { id: campaignId })),
      );

      const result = await service[method](campaignId);

      expect(http.patch).toHaveBeenCalledWith(`/${campaignId}`, { status });
      expect(result).toBeInstanceOf(OutreachCampaign);
      expect(result.status).toBe(status);
    });
  });

  it('addTargets POSTs the target urls', async () => {
    http.post.mockResolvedValue(axiosResponse({ added: 2, skipped: 1 }));

    const result = await service.addTargets(campaignId, [
      'https://x.com/a',
      'https://x.com/b',
    ]);

    expect(http.post).toHaveBeenCalledWith(`/${campaignId}/targets`, {
      urls: ['https://x.com/a', 'https://x.com/b'],
    });
    expect(result).toEqual({ added: 2, skipped: 1 });
  });

  it('addDmRecipients POSTs usernames with the DM target type', async () => {
    http.post.mockResolvedValue(axiosResponse({ added: 1, skipped: 0 }));

    const result = await service.addDmRecipients(campaignId, ['creator']);

    expect(http.post).toHaveBeenCalledWith(`/${campaignId}/targets`, {
      targetType: CampaignTargetType.DM_RECIPIENT,
      usernames: ['creator'],
    });
    expect(result).toEqual({ added: 1, skipped: 0 });
  });

  it('parseUrl POSTs the url for validation', async () => {
    const parsed = { externalId: '123', valid: true };
    http.post.mockResolvedValue(axiosResponse(parsed));

    const result = await service.parseUrl('https://x.com/status/123');

    expect(http.post).toHaveBeenCalledWith('/parse-url', {
      url: 'https://x.com/status/123',
    });
    expect(result).toEqual(parsed);
  });

  it('getAnalytics GETs the campaign analytics', async () => {
    const analytics = {
      campaign: { id: campaignId },
      repliesPerHour: 2,
      successRate: 0.8,
      targetStats: {
        failed: 0,
        pending: 1,
        processing: 0,
        replied: 4,
        scheduled: 0,
        skipped: 0,
        total: 5,
      },
    };
    http.get.mockResolvedValue(axiosResponse(analytics));

    const result = await service.getAnalytics(campaignId);

    expect(http.get).toHaveBeenCalledWith(`/${campaignId}/analytics`);
    expect(result).toEqual(analytics);
  });

  it('getTargets GETs the campaign targets', async () => {
    const targets = [{ id: 'target_1' }];
    http.get.mockResolvedValue(axiosResponse(targets));

    const result = await service.getTargets(campaignId);

    expect(http.get).toHaveBeenCalledWith(`/${campaignId}/targets`);
    expect(result).toEqual(targets);
  });

  it('discoverTargets POSTs discovery options', async () => {
    const discovery = { added: 3, discovered: 5, targets: [] };
    http.post.mockResolvedValue(axiosResponse(discovery));

    const result = await service.discoverTargets(campaignId, {
      addToCampaign: true,
      limit: 5,
    });

    expect(http.post).toHaveBeenCalledWith(`/${campaignId}/targets/discover`, {
      addToCampaign: true,
      limit: 5,
    });
    expect(result).toEqual(discovery);
  });

  it('discoverTargets defaults options to an empty object', async () => {
    http.post.mockResolvedValue(
      axiosResponse({ added: 0, discovered: 0, targets: [] }),
    );

    await service.discoverTargets(campaignId);

    expect(http.post).toHaveBeenCalledWith(
      `/${campaignId}/targets/discover`,
      {},
    );
  });

  it('previewReply POSTs to the preview route', async () => {
    const preview = { replyText: 'Nice post!', target: { id: 'target_1' } };
    http.post.mockResolvedValue(axiosResponse(preview));

    const result = await service.previewReply(campaignId, 'target_1');

    expect(http.post).toHaveBeenCalledWith(
      `/${campaignId}/targets/target_1/preview`,
    );
    expect(result).toEqual(preview);
  });
});
