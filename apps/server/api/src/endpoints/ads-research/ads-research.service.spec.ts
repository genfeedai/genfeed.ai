import { AdPerformanceService } from '@api/collections/ad-performance/services/ad-performance.service';
import { CreativePatternsService } from '@api/collections/creative-patterns/creative-patterns.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { WorkflowsService } from '@api/collections/workflows/services/workflows.service';
import { AdsResearchService } from '@api/endpoints/ads-research/ads-research.service';
import { AdsGatewayService } from '@api/services/ads-gateway/ads-gateway.service';
import { WorkflowStatus, WorkflowTrigger } from '@genfeedai/enums';
import { BadRequestException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';

describe('AdsResearchService', () => {
  let service: AdsResearchService;
  let adPerformanceService: vi.Mocked<AdPerformanceService>;
  let creativePatternsService: vi.Mocked<CreativePatternsService>;
  let credentialsService: vi.Mocked<CredentialsService>;
  let adsGatewayService: vi.Mocked<AdsGatewayService>;
  let workflowsService: vi.Mocked<WorkflowsService>;

  const orgId = '507f191e810c19729de860ee'.toString();
  const userId = '507f191e810c19729de860ee'.toString();
  const credentialId = '507f191e810c19729de860ee'.toString();

  const mockCredential = {
    _id: credentialId,
    accessToken: 'tok-abc',
    isDeleted: false,
  };

  const mockAdPerformance = {
    _id: '507f191e810c19729de860ee',
    adPlatform: 'meta',
    bodyText: 'Great ad body',
    campaignName: 'Top Campaign',
    campaignObjective: 'CONVERSIONS',
    campaignStatus: 'ACTIVE',
    clicks: 500,
    ctaText: 'Learn More',
    ctr: 2.5,
    externalAdId: 'ext-001',
    headlineText: 'Amazing Headline',
    imageUrls: ['https://img.test/a.jpg'],
    impressions: 20000,
    industry: 'fitness',
    performanceScore: 88,
    roas: 3.2,
    spend: 1000,
    videoUrls: [],
  };

  const mockPattern = {
    _id: '507f191e810c19729de860ee',
    avgPerformanceScore: 85,
    description: 'Pattern desc',
    examples: [{ text: 'ex1' }, { text: 'ex2' }],
    industry: 'fitness',
    label: 'Social proof',
    patternType: 'hook',
    platform: 'facebook',
  };

  const mockAdapter = {
    getTopPerformers: vi.fn(),
    listAds: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdsResearchService,
        {
          provide: AdPerformanceService,
          useValue: {
            findById: vi.fn(),
            findTopPerformers: vi.fn(),
          },
        },
        {
          provide: CreativePatternsService,
          useValue: {
            findAll: vi.fn(),
          },
        },
        {
          provide: CredentialsService,
          useValue: {
            findOne: vi.fn(),
          },
        },
        {
          provide: AdsGatewayService,
          useValue: {
            getAdapter: vi.fn(),
          },
        },
        {
          provide: WorkflowsService,
          useValue: {
            createWorkflow: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AdsResearchService>(AdsResearchService);
    adPerformanceService = module.get(
      AdPerformanceService,
    ) as vi.Mocked<AdPerformanceService>;
    creativePatternsService = module.get(
      CreativePatternsService,
    ) as vi.Mocked<CreativePatternsService>;
    credentialsService = module.get(
      CredentialsService,
    ) as vi.Mocked<CredentialsService>;
    adsGatewayService = module.get(
      AdsGatewayService,
    ) as vi.Mocked<AdsGatewayService>;
    workflowsService = module.get(
      WorkflowsService,
    ) as vi.Mocked<WorkflowsService>;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('listAds', () => {
    it('should return both public and connected ads when source is "all"', async () => {
      adPerformanceService.findTopPerformers.mockResolvedValue([
        mockAdPerformance as any,
      ]);
      creativePatternsService.findAll.mockResolvedValue([mockPattern as any]);
      credentialsService.findOne.mockResolvedValue(mockCredential as any);
      adsGatewayService.getAdapter.mockReturnValue(mockAdapter as any);
      mockAdapter.listAds.mockResolvedValue([]);
      mockAdapter.getTopPerformers.mockResolvedValue([]);

      const result = await service.listAds(orgId, {
        adAccountId: 'acc-001',
        credentialId,
        platform: 'meta',
        source: 'all',
      } as any);

      expect(result.summary.selectedSource).toBe('all');
      expect(adPerformanceService.findTopPerformers).toHaveBeenCalled();
    });

    it('should skip public ads when source is "my_accounts"', async () => {
      credentialsService.findOne.mockResolvedValue(mockCredential as any);
      adsGatewayService.getAdapter.mockReturnValue(mockAdapter as any);
      mockAdapter.listAds.mockResolvedValue([]);
      mockAdapter.getTopPerformers.mockResolvedValue([]);

      const result = await service.listAds(orgId, {
        adAccountId: 'acc-001',
        credentialId,
        platform: 'meta',
        source: 'my_accounts',
      } as any);

      expect(adPerformanceService.findTopPerformers).not.toHaveBeenCalled();
      expect(result.publicAds).toEqual([]);
    });

    it('should skip connected ads when source is "public"', async () => {
      adPerformanceService.findTopPerformers.mockResolvedValue([
        mockAdPerformance as any,
      ]);
      creativePatternsService.findAll.mockResolvedValue([]);

      const result = await service.listAds(orgId, {
        source: 'public',
      } as any);

      expect(adsGatewayService.getAdapter).not.toHaveBeenCalled();
      expect(result.connectedAds).toEqual([]);
    });

    it('should apply default filter normalization', async () => {
      adPerformanceService.findTopPerformers.mockResolvedValue([]);

      const result = await service.listAds(orgId, { source: 'public' } as any);

      expect(result.filters).toMatchObject({
        channel: 'all',
        limit: 12,
        metric: 'performanceScore',
        source: 'public',
        timeframe: 'last_30_days',
      });
    });

    it('should cap limit at 24', async () => {
      adPerformanceService.findTopPerformers.mockResolvedValue([]);

      const result = await service.listAds(orgId, {
        limit: 100,
        source: 'public',
      } as any);

      expect(result.filters.limit).toBe(24);
    });
  });

  describe('getAdDetail', () => {
    it('should return public ad detail when source is "public"', async () => {
      const mockItem = {
        ...mockAdPerformance,
        landingPageUrl: 'https://lp.test',
      };
      adPerformanceService.findById.mockResolvedValue(mockItem as any);
      creativePatternsService.findAll.mockResolvedValue([mockPattern as any]);

      const result = await service.getAdDetail(orgId, {
        id: mockAdPerformance._id.toString(),
        source: 'public',
      });

      expect(result).toBeDefined();
      expect(result.source).toBe('public');
      expect(adPerformanceService.findById).toHaveBeenCalledWith(
        mockAdPerformance._id.toString(),
      );
    });

    it('should throw BadRequestException when public ad is not found', async () => {
      adPerformanceService.findById.mockResolvedValue(null);

      await expect(
        service.getAdDetail(orgId, { id: 'nonexistent', source: 'public' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for connected source without required params', async () => {
      await expect(
        service.getAdDetail(orgId, {
          id: 'some-id',
          source: 'my_accounts',
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException with invalid credentialId', async () => {
      await expect(
        service.getAdDetail(orgId, {
          adAccountId: 'acc-001',
          credentialId: 'not-a-valid-object-id',
          id: 'some-ad',
          platform: 'meta',
          source: 'my_accounts',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when credential is missing or disconnected', async () => {
      credentialsService.findOne.mockResolvedValue(null);

      await expect(
        service.getAdDetail(orgId, {
          adAccountId: 'acc-001',
          credentialId,
          id: 'some-ad',
          platform: 'meta',
          source: 'my_accounts',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when connected ad is not found', async () => {
      credentialsService.findOne.mockResolvedValue(mockCredential as any);
      adsGatewayService.getAdapter.mockReturnValue(mockAdapter as any);
      mockAdapter.listAds.mockResolvedValue([]);
      mockAdapter.getTopPerformers.mockResolvedValue([]);

      await expect(
        service.getAdDetail(orgId, {
          adAccountId: 'acc-001',
          credentialId,
          id: 'ghost-id',
          platform: 'meta',
          source: 'my_accounts',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('generateAdPack', () => {
    it('should build an AdPack from a public ad', async () => {
      const mockItem = {
        ...mockAdPerformance,
        landingPageUrl: 'https://lp.test',
      };
      adPerformanceService.findById.mockResolvedValue(mockItem as any);
      creativePatternsService.findAll.mockResolvedValue([]);

      const result = await service.generateAdPack(orgId, {
        adId: mockAdPerformance._id.toString(),
        brandName: 'FitBrand',
        industry: 'fitness',
        source: 'public',
      } as any);

      expect(result).toBeDefined();
      expect(result.headlines).toHaveLength(3);
      expect(result.headlines[0]).toContain('FitBrand');
      expect(result.campaignRecipe.platform).toBe('meta');
      expect(result.campaignRecipe.reviewStatus).toBe('review_required');
    });
  });

  describe('createRemixWorkflow', () => {
    it('should create a workflow from a public ad', async () => {
      const mockItem = {
        ...mockAdPerformance,
        landingPageUrl: 'https://lp.test',
      };
      adPerformanceService.findById.mockResolvedValue(mockItem as any);
      creativePatternsService.findAll.mockResolvedValue([]);
      workflowsService.createWorkflow.mockResolvedValue({
        _id: 'wf-123',
        label: 'FitBrand Meta Ads Ad Remix',
      } as any);

      const result = await service.createRemixWorkflow({
        adId: mockAdPerformance._id.toString(),
        brandName: 'FitBrand',
        organizationId: orgId,
        source: 'public',
        userId,
      } as any);

      expect(result.reviewRequired).toBe(true);
      expect(result.workflowId).toBe('wf-123');
      expect(workflowsService.createWorkflow).toHaveBeenCalledWith(
        userId,
        orgId,
        expect.objectContaining({ templateId: 'ad-remix-review' }),
      );
    });

    it('returns the created workflow _id and requests a draft review workflow', async () => {
      const mockItem = {
        ...mockAdPerformance,
        landingPageUrl: 'https://example.com',
      };
      adPerformanceService.findById.mockResolvedValue(mockItem as any);
      creativePatternsService.findAll.mockResolvedValue([]);
      workflowsService.createWorkflow.mockResolvedValue({
        _id: 'workflow_123',
        label: 'Brand Meta Ad Remix',
      } as any);

      const result = await service.createRemixWorkflow({
        adId: 'ad_123',
        brandId: 'brand_123',
        brandName: 'Brand',
        channel: 'meta',
        credentialId: 'cred_123',
        industry: 'SaaS',
        objective: 'Conversions',
        organizationId: orgId,
        platform: 'meta',
        source: 'public',
        userId,
      } as any);

      expect(workflowsService.createWorkflow).toHaveBeenCalledWith(
        userId,
        orgId,
        expect.objectContaining({
          status: WorkflowStatus.DRAFT,
          trigger: WorkflowTrigger.SCHEDULED,
        }),
      );
      expect(result.workflowId).toBe('workflow_123');
      expect(result.workflowName).toBe('Brand Meta Ad Remix');
    });
  });
});
