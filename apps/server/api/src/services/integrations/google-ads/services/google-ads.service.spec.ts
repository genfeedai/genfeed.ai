import { ConfigService } from '@api/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Test, type TestingModule } from '@nestjs/testing';
import { of, throwError } from 'rxjs';

vi.mock('@libs/utils/caller/caller.util', () => ({
  CallerUtil: { getCallerName: vi.fn().mockReturnValue('testMethod') },
}));

import { GoogleAdsService } from './google-ads.service';

const accessToken = 'token-abc';
const customerId = '123-456-789';
const cleanCustomerId = '123456789';

/** Wraps data in Observable-like format expected by firstValueFrom */
const makeHttpResponse = <T>(data: T) => of({ data });

describe('GoogleAdsService', () => {
  let service: GoogleAdsService;
  let httpService: vi.Mocked<HttpService>;
  let configService: vi.Mocked<ConfigService>;
  let loggerService: vi.Mocked<LoggerService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GoogleAdsService,
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn().mockReturnValue('dev-token-xyz'),
          },
        },
        {
          provide: HttpService,
          useValue: {
            get: vi.fn(),
            post: vi.fn(),
          },
        },
        {
          provide: LoggerService,
          useValue: {
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(GoogleAdsService);
    httpService = module.get(HttpService);
    configService = module.get(ConfigService);
    loggerService = module.get(LoggerService);

    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((
      callback: TimerHandler,
    ) => {
      if (typeof callback === 'function') {
        callback();
      }

      return 0 as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('listAccessibleCustomers', () => {
    it('should return customer list with details', async () => {
      // First call: listAccessibleCustomers endpoint
      httpService.get.mockReturnValue(
        makeHttpResponse({ resourceNames: ['customers/111', 'customers/222'] }),
      );

      // Two searchStream calls for individual customer details
      httpService.post
        .mockReturnValueOnce(
          makeHttpResponse([
            {
              results: [
                {
                  customer: {
                    currencyCode: 'USD',
                    descriptiveName: 'Acme Corp',
                    id: '111',
                    manager: false,
                    timeZone: 'America/New_York',
                  },
                },
              ],
            },
          ]),
        )
        .mockReturnValueOnce(
          makeHttpResponse([
            {
              results: [
                {
                  customer: {
                    currencyCode: 'EUR',
                    descriptiveName: 'Widgets Ltd',
                    id: '222',
                    manager: true,
                    timeZone: 'Europe/London',
                  },
                },
              ],
            },
          ]),
        );

      const result = await service.listAccessibleCustomers(accessToken);

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        currencyCode: 'USD',
        descriptiveName: 'Acme Corp',
        id: '111',
        isManager: false,
      });
    });

    it('should skip a customer and log warn if detail lookup fails', async () => {
      httpService.get.mockReturnValue(
        makeHttpResponse({ resourceNames: ['customers/999'] }),
      );
      httpService.post.mockReturnValue(
        throwError(() => new Error('access denied')),
      );

      const result = await service.listAccessibleCustomers(accessToken);

      expect(result).toHaveLength(0);
      expect(loggerService.warn).toHaveBeenCalledWith(
        expect.stringContaining('999'),
      );
    });

    it('should throw and log error when the listing call fails', async () => {
      httpService.get.mockReturnValue(
        throwError(() =>
          Object.assign(new Error('network'), { response: { status: 500 } }),
        ),
      );

      await expect(
        service.listAccessibleCustomers(accessToken),
      ).rejects.toThrow();
      expect(loggerService.error).toHaveBeenCalled();
    });
  });

  describe('listCampaigns', () => {
    const campaignRow = {
      campaign: {
        advertisingChannelType: 'SEARCH',
        endDate: '2026-12-31',
        id: 'camp-1',
        name: 'My Campaign',
        startDate: '2026-01-01',
        status: 'ENABLED',
      },
      campaignBudget: { amountMicros: '5000000' },
    };

    it('should return mapped campaigns', async () => {
      httpService.post.mockReturnValue(
        makeHttpResponse([{ results: [campaignRow] }]),
      );

      const result = await service.listCampaigns(accessToken, customerId);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        budgetAmountMicros: '5000000',
        id: 'camp-1',
        name: 'My Campaign',
        status: 'ENABLED',
      });
    });

    it('should include status filter in query when params.status is set', async () => {
      httpService.post.mockReturnValue(makeHttpResponse([{ results: [] }]));

      await service.listCampaigns(accessToken, customerId, {
        status: 'PAUSED',
      });

      const queryArg = (httpService.post.mock.calls[0][1] as { query: string })
        .query;
      expect(queryArg).toContain("campaign.status = 'PAUSED'");
    });

    it('should throw and log when API call fails', async () => {
      httpService.post.mockReturnValue(
        throwError(() => new Error('API error')),
      );

      await expect(
        service.listCampaigns(accessToken, customerId),
      ).rejects.toThrow('API error');
      expect(loggerService.error).toHaveBeenCalled();
    });
  });

  describe('getCampaign', () => {
    it('should return null when no results are returned', async () => {
      httpService.post.mockReturnValue(makeHttpResponse([{ results: [] }]));

      const result = await service.getCampaign(
        accessToken,
        customerId,
        'camp-1',
      );

      expect(result).toBeNull();
    });

    it('should return a campaign when found', async () => {
      httpService.post.mockReturnValue(
        makeHttpResponse([
          {
            results: [
              {
                campaign: {
                  advertisingChannelType: 'DISPLAY',
                  id: 'camp-1',
                  name: 'Test',
                  status: 'ENABLED',
                },
              },
            ],
          },
        ]),
      );

      const result = await service.getCampaign(
        accessToken,
        customerId,
        'camp-1',
      );

      expect(result).toMatchObject({ id: 'camp-1', name: 'Test' });
    });
  });

  describe('pauseCampaign', () => {
    it('should call updateCampaign with PAUSED status', async () => {
      const updateSpy = vi.spyOn(service, 'updateCampaign').mockResolvedValue();

      await service.pauseCampaign(accessToken, customerId, 'camp-42');

      expect(updateSpy).toHaveBeenCalledWith(
        accessToken,
        customerId,
        'camp-42',
        { status: 'PAUSED' },
        undefined,
      );
    });
  });

  describe('getCampaignMetrics', () => {
    it('should return mapped metrics rows', async () => {
      httpService.post.mockReturnValue(
        makeHttpResponse([
          {
            results: [
              {
                campaign: { id: 'camp-1', name: 'Campaign One' },
                metrics: {
                  averageCpc: 0.5,
                  averageCpm: 2.0,
                  clicks: '100',
                  conversions: 10,
                  conversionsValue: 500,
                  costMicros: '1000000',
                  ctr: 0.05,
                  impressions: '2000',
                },
              },
            ],
          },
        ]),
      );

      const result = await service.getCampaignMetrics(
        accessToken,
        customerId,
        'camp-1',
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        campaignId: 'camp-1',
        clicks: 100,
        costMicros: 1000000,
        impressions: 2000,
      });
    });

    it('should include segment date when segmentByDate is true', async () => {
      httpService.post.mockReturnValue(makeHttpResponse([{ results: [] }]));

      await service.getCampaignMetrics(accessToken, customerId, 'camp-1', {
        segmentByDate: true,
      });

      const queryArg = (httpService.post.mock.calls[0][1] as { query: string })
        .query;
      expect(queryArg).toContain('segments.date');
    });
  });

  describe('listAdGroups', () => {
    it('should filter by campaignId when provided', async () => {
      httpService.post.mockReturnValue(makeHttpResponse([{ results: [] }]));

      await service.listAdGroups(accessToken, customerId, 'camp-99');

      const queryArg = (httpService.post.mock.calls[0][1] as { query: string })
        .query;
      expect(queryArg).toContain('campaign.id = camp-99');
    });

    it('should return mapped ad groups', async () => {
      httpService.post.mockReturnValue(
        makeHttpResponse([
          {
            results: [
              {
                adGroup: {
                  campaign: `customers/${cleanCustomerId}/campaigns/camp-1`,
                  cpcBidMicros: '500000',
                  id: 'ag-1',
                  name: 'Ad Group One',
                  status: 'ENABLED',
                },
              },
            ],
          },
        ]),
      );

      const result = await service.listAdGroups(accessToken, customerId);

      expect(result[0]).toMatchObject({
        cpcBidMicros: '500000',
        id: 'ag-1',
        name: 'Ad Group One',
        status: 'ENABLED',
      });
      expect(result[0]?.campaignId).toBe('camp-1');
    });
  });

  describe('getKeywordPerformance', () => {
    it('should return mapped keyword rows', async () => {
      httpService.post.mockReturnValue(
        makeHttpResponse([
          {
            results: [
              {
                adGroupCriterion: {
                  keyword: { matchType: 'BROAD', text: 'buy shoes' },
                  qualityInfo: { qualityScore: 8 },
                },
                metrics: {
                  averageCpc: 0.75,
                  clicks: '300',
                  conversions: 20,
                  costMicros: '225000',
                  ctr: 0.15,
                  impressions: '2000',
                },
              },
            ],
          },
        ]),
      );

      const result = await service.getKeywordPerformance(
        accessToken,
        customerId,
      );

      expect(result[0]).toMatchObject({
        clicks: 300,
        keywordText: 'buy shoes',
        matchType: 'BROAD',
        qualityScore: 8,
      });
    });
  });
});
