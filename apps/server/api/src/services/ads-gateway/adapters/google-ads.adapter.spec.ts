import { GoogleAdsAdapter } from '@api/services/ads-gateway/adapters/google-ads.adapter';
import { GoogleAdsService } from '@api/services/integrations/google-ads/services/google-ads.service';
import type { AdsAdapterContext } from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException } from '@nestjs/common';

describe('GoogleAdsAdapter', () => {
  let adapter: GoogleAdsAdapter;
  let googleAdsService: {
    createAdGroup: ReturnType<typeof vi.fn>;
    createResponsiveSearchAd: ReturnType<typeof vi.fn>;
    getCampaign: ReturnType<typeof vi.fn>;
    getCampaignMetrics: ReturnType<typeof vi.fn>;
    listAdGroups: ReturnType<typeof vi.fn>;
    listAds: ReturnType<typeof vi.fn>;
    listCampaigns: ReturnType<typeof vi.fn>;
    pauseCampaign: ReturnType<typeof vi.fn>;
    updateCampaign: ReturnType<typeof vi.fn>;
  };
  let logger: {
    warn: ReturnType<typeof vi.fn>;
  };

  const ctx: AdsAdapterContext = {
    accessToken: 'token',
    adAccountId: '1234567890',
    credentialId: 'credential-1',
    loginCustomerId: '1112223334',
    organizationId: 'org-1',
  };

  beforeEach(() => {
    googleAdsService = {
      createAdGroup: vi.fn(),
      createResponsiveSearchAd: vi.fn(),
      getCampaign: vi.fn(),
      getCampaignMetrics: vi.fn(),
      listAdGroups: vi.fn(),
      listAds: vi.fn(),
      listCampaigns: vi.fn(),
      pauseCampaign: vi.fn(),
      updateCampaign: vi.fn(),
    };

    logger = {
      warn: vi.fn(),
    };

    adapter = new GoogleAdsAdapter(
      googleAdsService as unknown as GoogleAdsService,
      logger as unknown as LoggerService,
    );
  });

  it('throws descriptive error for createCampaign', async () => {
    await expect(
      adapter.createCampaign(ctx, {
        name: 'Brand Search',
        objective: 'SEARCH',
      }),
    ).rejects.toThrow(BadRequestException);

    await expect(
      adapter.createCampaign(ctx, {
        name: 'Brand Search',
        objective: 'SEARCH',
      }),
    ).rejects.toThrow('does not support this unified createCampaign operation');

    expect(logger.warn).toHaveBeenCalled();
  });

  it('updates campaign and returns mapped campaign', async () => {
    googleAdsService.getCampaign.mockResolvedValue({
      advertisingChannelType: 'SEARCH',
      budgetAmountMicros: '35000000',
      id: '987',
      name: 'Updated Campaign',
      status: 'ENABLED',
    });

    const result = await adapter.updateCampaign(ctx, '987', {
      dailyBudget: 35,
      name: 'Updated Campaign',
      status: 'ENABLED',
    });

    expect(googleAdsService.updateCampaign).toHaveBeenCalledWith(
      'token',
      '1234567890',
      '987',
      {
        dailyBudget: 35,
        name: 'Updated Campaign',
        status: 'ENABLED',
      },
      '1112223334',
    );
    expect(result).toEqual(
      expect.objectContaining({
        dailyBudget: 35,
        id: '987',
        name: 'Updated Campaign',
        objective: 'SEARCH',
        platform: 'google',
        status: 'ENABLED',
      }),
    );
  });

  it('pauses campaign', async () => {
    await adapter.pauseCampaign(ctx, '111');

    expect(googleAdsService.pauseCampaign).toHaveBeenCalledWith(
      'token',
      '1234567890',
      '111',
      '1112223334',
    );
  });

  it('lists ad sets from ad groups', async () => {
    googleAdsService.listAdGroups.mockResolvedValue([
      {
        campaignId: '200',
        cpcBidMicros: '1200000',
        id: '100',
        name: 'Ad Group A',
        status: 'PAUSED',
      },
    ]);

    const result = await adapter.listAdSets(ctx, '200');

    expect(googleAdsService.listAdGroups).toHaveBeenCalledWith(
      'token',
      '1234567890',
      '200',
      '1112223334',
    );
    expect(result).toEqual([
      {
        campaignId: '200',
        dailyBudget: 1.2,
        id: '100',
        name: 'Ad Group A',
        platform: 'google',
        status: 'PAUSED',
      },
    ]);
  });

  it('creates ad set via ad group creation', async () => {
    googleAdsService.createAdGroup.mockResolvedValue({
      campaignId: '200',
      cpcBidMicros: '2500000',
      id: '301',
      name: 'New Ad Group',
      status: 'PAUSED',
    });

    const result = await adapter.createAdSet(ctx, {
      campaignId: '200',
      name: 'New Ad Group',
      targeting: { countries: ['US'] },
    });

    expect(googleAdsService.createAdGroup).toHaveBeenCalledWith(
      'token',
      '1234567890',
      {
        campaignId: '200',
        cpcBidMicros: undefined,
        name: 'New Ad Group',
      },
      '1112223334',
    );
    expect(result).toEqual({
      campaignId: '200',
      dailyBudget: 2.5,
      id: '301',
      name: 'New Ad Group',
      optimizationGoal: undefined,
      platform: 'google',
      status: 'PAUSED',
      targeting: { countries: ['US'] },
    });
  });

  it('lists ads from ad groups ads', async () => {
    googleAdsService.listAds.mockResolvedValue([
      {
        adGroupId: 'ag-1',
        descriptions: ['Desc 1'],
        finalUrls: ['https://example.com'],
        headlines: ['Headline 1'],
        id: 'ad-1',
        name: 'Ad One',
        status: 'PAUSED',
      },
    ]);

    const result = await adapter.listAds(ctx, 'ag-1');

    expect(googleAdsService.listAds).toHaveBeenCalledWith(
      'token',
      '1234567890',
      'ag-1',
      '1112223334',
    );
    expect(result).toEqual([
      {
        adSetId: 'ag-1',
        creative: {
          body: 'Desc 1',
          linkUrl: 'https://example.com',
          title: 'Headline 1',
        },
        id: 'ad-1',
        name: 'Ad One',
        platform: 'google',
        status: 'PAUSED',
      },
    ]);
  });

  it('creates ad as responsive search ad', async () => {
    googleAdsService.createResponsiveSearchAd.mockResolvedValue({
      adGroupId: 'ag-1',
      descriptions: ['Body A'],
      finalUrls: ['https://example.com'],
      headlines: ['Headline A'],
      id: 'ad-2',
      name: 'Ad Two',
      status: 'PAUSED',
    });

    const result = await adapter.createAd(ctx, {
      adSetId: 'ag-1',
      creative: {
        body: 'Body A',
        linkUrl: 'https://example.com',
        title: 'Headline A',
      },
      name: 'Ad Two',
    });

    expect(googleAdsService.createResponsiveSearchAd).toHaveBeenCalledWith(
      'token',
      '1234567890',
      {
        adGroupId: 'ag-1',
        descriptions: ['Body A'],
        finalUrl: 'https://example.com',
        headlines: ['Headline A'],
        name: 'Ad Two',
      },
      '1112223334',
    );
    expect(result).toEqual({
      adSetId: 'ag-1',
      creative: {
        body: 'Body A',
        linkUrl: 'https://example.com',
        title: 'Headline A',
      },
      id: 'ad-2',
      name: 'Ad Two',
      platform: 'google',
      status: 'PAUSED',
    });
  });

  it('returns top performers sorted by metric and limit', async () => {
    googleAdsService.listCampaigns.mockResolvedValue([
      {
        advertisingChannelType: 'SEARCH',
        id: '1',
        name: 'Campaign One',
        status: 'ENABLED',
      },
      {
        advertisingChannelType: 'SEARCH',
        id: '2',
        name: 'Campaign Two',
        status: 'ENABLED',
      },
    ]);

    googleAdsService.getCampaignMetrics
      .mockResolvedValueOnce([
        {
          averageCpc: 1000000,
          averageCpm: 2000000,
          campaignId: '1',
          campaignName: 'Campaign One',
          clicks: 10,
          conversions: 2,
          conversionsValue: 50,
          costMicros: 5000000,
          ctr: 2,
          impressions: 500,
        },
      ])
      .mockResolvedValueOnce([
        {
          averageCpc: 900000,
          averageCpm: 1500000,
          campaignId: '2',
          campaignName: 'Campaign Two',
          clicks: 15,
          conversions: 3,
          conversionsValue: 75,
          costMicros: 4500000,
          ctr: 3,
          impressions: 600,
        },
      ]);

    const result = await adapter.getTopPerformers(ctx, {
      limit: 1,
      metric: 'ctr',
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(
      expect.objectContaining({
        id: '2',
        metric: 'ctr',
        name: 'Campaign Two',
        value: 3,
      }),
    );
  });
});
