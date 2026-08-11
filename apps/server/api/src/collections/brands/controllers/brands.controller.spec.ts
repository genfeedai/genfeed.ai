import type { BrandEntity } from '@api/collections/brands/entities/brand.entity';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import type { AggregatePaginateResult } from '@api/types/aggregate-paginate-result';
import 'reflect-metadata';

import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { ArticlesService } from '@api/collections/articles/services/articles.service';
import { BrandsController } from '@api/collections/brands/controllers/brands.controller';
import { BrandsAgentConfigController } from '@api/collections/brands/controllers/brands-agent-config.controller';
import { BrandSetupService } from '@api/collections/brands/services/brand-setup.service';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { ImagesService } from '@api/collections/images/services/images.service';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { LinksService } from '@api/collections/links/services/links.service';
import { MusicsService } from '@api/collections/musics/services/musics.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { AnalyticsAggregationService } from '@api/collections/posts/services/analytics-aggregation.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { VideosService } from '@api/collections/videos/services/videos.service';
import { CREDITS_KEY } from '@api/helpers/decorators/credits/credits.decorator';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { BrandScraperService } from '@api/services/brand-scraper/brand-scraper.service';
import type { IAuthPublicMetadata } from '@api/shared/interfaces/auth/auth-public-metadata.interface';
import {
  BrandKitApplySerializer,
  BrandKitAssetImportSerializer,
  BrandKitSerializer,
  BrandSerializer,
} from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import { ForbiddenException } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

// Mock utility functions
vi.mock('@genfeedai/helpers', async () => ({
  ...(await vi.importActual('@genfeedai/helpers')),
  getDeserializer: vi.fn((dto) => Promise.resolve(dto)),
}));

vi.mock('@api/helpers/utils/response/response.util', () => ({
  returnNotFound: vi.fn((type, id) => ({
    errors: [
      { detail: `${type} ${id} not found`, status: '404', title: 'Not Found' },
    ],
  })),
  serializeCollection: vi.fn((_req, _serializer, data) => ({
    data: data.docs || data,
  })),
  serializeSingle: vi.fn((_req, _serializer, data) => ({ data })),
  setTopLinks: vi.fn((_req, opts) => opts),
}));

describe('BrandsController', () => {
  let agentConfigController: BrandsAgentConfigController;
  let activitiesService: vi.Mocked<ActivitiesService>;
  let controller: BrandsController;
  let brandSetupService: vi.Mocked<BrandSetupService>;
  let brandScraperService: vi.Mocked<BrandScraperService>;
  let brandsService: vi.Mocked<BrandsService>;
  let credentialsService: vi.Mocked<CredentialsService>;
  let _loggerService: vi.Mocked<LoggerService>;

  const mockUser = {
    id: 'user-123',
    publicMetadata: {
      brand: 'cmbrand000000000000000001',
      isSuperAdmin: false,
      organization: 'cmorganization000000000000001',
      user: 'cmuser0000000000000000001',
    } as IAuthPublicMetadata,
  } as unknown as User;

  const mockBrand = {
    description: 'A test brand',
    id: 'cmbrand000000000000000001',
    isDeleted: false,
    name: 'Test Brand',
    organizationId: 'cmorganization000000000000001',
    slug: 'test-brand',
    userId: 'cmuser0000000000000000001',
  };

  const mockRequest = {
    originalUrl: '/api/brands',
    query: {},
  } as Request;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BrandsAgentConfigController, BrandsController],
      providers: [
        {
          provide: REQUEST,
          useValue: mockRequest,
        },
        {
          provide: LoggerService,
          useValue: {
            debug: vi.fn(),
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
        {
          provide: BrandsService,
          useValue: {
            applyBrandKitDraft: vi.fn(),
            // `decorateForResponse` runs on every single-brand response and
            // destructures the first element, so the stub has to hand the rows
            // straight back rather than default to undefined.
            attachBrandKitAssetRelations: vi.fn((brands: unknown[]) =>
              Promise.resolve(brands),
            ),
            buildManualBrandKitDraft: vi.fn(),
            crawlWebsiteBrandKitDraft: vi.fn(),
            create: vi.fn(),
            findAll: vi.fn(),
            findOne: vi.fn(),
            findOneBySlug: vi.fn(),
            generateBrandVoice: vi.fn(),
            importBrandKitAssets: vi.fn(),
            patch: vi.fn(),
            relocateToOrganization: vi.fn(),
            remove: vi.fn(),
          },
        },
        {
          provide: ActivitiesService,
          useValue: { create: vi.fn(), findAll: vi.fn(), findOne: vi.fn() },
        },
        {
          provide: VideosService,
          useValue: { findAll: vi.fn(), findOne: vi.fn() },
        },
        {
          provide: ImagesService,
          useValue: { findAll: vi.fn(), findOne: vi.fn() },
        },
        {
          provide: ArticlesService,
          useValue: { findAll: vi.fn(), findOne: vi.fn() },
        },
        {
          provide: MusicsService,
          useValue: { findAll: vi.fn(), findOne: vi.fn() },
        },
        {
          provide: CredentialsService,
          useValue: {
            // `decorateForResponse` resolves the brand's connected accounts,
            // so `find` has to resolve to a list rather than undefined.
            find: vi.fn(() => Promise.resolve([])),
            findAll: vi.fn(),
            findOne: vi.fn(),
          },
        },
        {
          provide: IngredientsService,
          useValue: { findAll: vi.fn(), findOne: vi.fn() },
        },
        {
          provide: LinksService,
          useValue: { findAll: vi.fn(), findOne: vi.fn() },
        },
        {
          provide: OrganizationSettingsService,
          useValue: { findAll: vi.fn(), findOne: vi.fn() },
        },
        {
          provide: PostsService,
          useValue: { findAll: vi.fn(), findOne: vi.fn() },
        },
        {
          provide: AnalyticsAggregationService,
          useValue: { findAll: vi.fn(), findOne: vi.fn() },
        },
        {
          provide: BrandSetupService,
          useValue: {
            addReferenceImages: vi.fn(),
            setupBrand: vi.fn(),
            updateBrandNameById: vi.fn(),
          },
        },
        {
          provide: BrandScraperService,
          useValue: {
            scrapeWebsite: vi.fn(),
          },
        },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(CreditsGuard)
      .useValue({ canActivate: () => true })
      .overrideInterceptor(CreditsInterceptor)
      .useValue({
        intercept: (_context: unknown, next: { handle: () => unknown }) =>
          next.handle(),
      })
      .compile();

    agentConfigController = module.get<BrandsAgentConfigController>(
      BrandsAgentConfigController,
    );
    activitiesService = module.get(ActivitiesService);
    controller = module.get<BrandsController>(BrandsController);
    brandSetupService = module.get(BrandSetupService);
    brandScraperService = module.get(BrandScraperService);
    brandsService = module.get(BrandsService);
    credentialsService = module.get(CredentialsService);
    _loggerService = module.get(LoggerService);

    vi.spyOn(BrandSerializer, 'serialize').mockImplementation((data) => ({
      data,
    }));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('previewWebsite', () => {
    it('returns the resolved company logo ahead of unrelated social imagery', async () => {
      brandScraperService.scrapeWebsite.mockResolvedValue({
        companyName: 'Acme',
        logoUrl:
          'https://img.logo.dev/acme.com?token=pk_test&size=128&format=png&fallback=monogram',
        ogImage: 'https://acme.com/social-card.jpg',
        scrapedAt: new Date('2026-08-11T00:00:00.000Z'),
        sourceUrl: 'https://acme.com',
      });

      const result = await controller.previewWebsite({
        websiteUrl: 'https://acme.com',
      });

      expect(result.data).toMatchObject({
        label: 'Acme',
        logoUrl:
          'https://img.logo.dev/acme.com?token=pk_test&size=128&format=png&fallback=monogram',
      });
    });

    it('leaves the logo empty for the deterministic placeholder when resolution fails', async () => {
      brandScraperService.scrapeWebsite.mockResolvedValue({
        companyName: 'Acme',
        ogImage: 'https://acme.com/social-card.jpg',
        scrapedAt: new Date('2026-08-11T00:00:00.000Z'),
        sourceUrl: 'https://acme.com',
      });

      const result = await controller.previewWebsite({
        websiteUrl: 'https://acme.com',
      });

      expect(result.data.logoUrl).toBeUndefined();
    });
  });

  it('charges one credit for direct AI brand profile generation', () => {
    expect(
      Reflect.getMetadata(
        CREDITS_KEY,
        agentConfigController.generateBrandVoice,
      ),
    ).toMatchObject({
      amount: 1,
      description: 'AI brand profile generation',
    });
  });

  it('passes onboarding profile fields through the sync rename path', async () => {
    brandsService.findOne
      .mockResolvedValueOnce(mockBrand as never)
      .mockResolvedValueOnce({ ...mockBrand, label: 'Moonrise' } as never);

    const result = await controller.patch(mockRequest, mockUser, 'brand_1', {
      agentConfig: { voice: { audience: 'Founders', tone: 'Bold' } },
      description: 'Brand: Moonrise.',
      label: 'Moonrise',
      organizationLabel: 'Acme Studio',
      syncOrganizationName: true,
      text: 'Tone: Bold.',
    } as never);

    expect(brandSetupService.updateBrandNameById).toHaveBeenCalledWith(
      'brand_1',
      'Moonrise',
      mockUser,
      {
        agentConfig: { voice: { audience: 'Founders', tone: 'Bold' } },
        description: 'Brand: Moonrise.',
        organizationName: 'Acme Studio',
        text: 'Tone: Bold.',
      },
    );
    expect(result).toEqual({
      data: { ...mockBrand, credentials: [], label: 'Moonrise' },
    });
  });

  it('does not forward client-supplied ownership fields on a normal patch', async () => {
    const brandId = 'cmbrand000000000000000001';
    brandsService.findOne.mockResolvedValue(mockBrand as never);
    brandsService.patch.mockResolvedValue({
      ...mockBrand,
      label: 'Renamed Brand',
    } as never);

    const result = await controller.patch(mockRequest, mockUser, brandId, {
      brand: 'c07f191e810c19729de860ee',
      brandId: 'c07f191e810c19729de860ee',
      label: 'Renamed Brand',
      organization: 'c07f191e810c19729de860ee',
      user: 'c07f191e810c19729de860ee',
      userId: 'c07f191e810c19729de860ee',
    } as never);

    expect(brandsService.patch).toHaveBeenCalledWith(
      brandId,
      { label: 'Renamed Brand' },
      [],
    );
    // `decorateForResponse` resolves the declared `credentials` relation on every
    // single-brand response, patches included — empty here because this brand has
    // no connected accounts.
    expect(result).toEqual({
      data: { ...mockBrand, credentials: [], label: 'Renamed Brand' },
    });
  });

  it('routes an explicit organization change through the relocation operation', async () => {
    const brandId = 'c07f191e810c19729de860ee';
    const destinationOrganizationId = 'd07f191e810c19729de860ee';
    const summary = {
      membersSevered: 0,
      schedulingPending: 0,
      workflowsClonedActive: 0,
      workflowsClonedPaused: 0,
      workflowsMoved: 0,
    };
    brandsService.findOne.mockResolvedValue({
      ...mockBrand,
      organizationId: 'c07f191e810c19729de860ee',
    } as never);
    brandsService.relocateToOrganization.mockResolvedValue({
      brand: {
        ...mockBrand,
        organizationId: destinationOrganizationId,
      },
      summary,
    } as never);

    const updateDto = {
      label: 'Relocated Brand',
      organizationId: destinationOrganizationId,
    };
    const result = await controller.patch(
      mockRequest,
      mockUser,
      brandId,
      updateDto,
    );

    expect(brandsService.patch).not.toHaveBeenCalled();
    expect(brandsService.relocateToOrganization).toHaveBeenCalledWith(
      brandId,
      updateDto,
      {
        isSuperAdmin: false,
        userId: mockUser.publicMetadata.user,
      },
    );
    expect(activitiesService.create).toHaveBeenCalledOnce();
    expect(result.meta).toEqual(summary);
  });

  describe('findAll', () => {
    it('should return paginated brands', async () => {
      const mockResult = {
        docs: [mockBrand],
        hasNextPage: false,
        hasPrevPage: false,
        limit: 10,
        page: 1,
        totalDocs: 1,
        totalPages: 1,
      };

      brandsService.findAll.mockResolvedValue(
        mockResult as unknown as AggregatePaginateResult<unknown>,
      );

      const query: BaseQueryDto = {
        isDeleted: false,
        limit: 10,
        page: 1,
        pagination: true,
      };

      const result = await controller.findAll(mockRequest, mockUser, query);

      expect(brandsService.findAll).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe('buildFindAllQuery', () => {
    it('honors superadmin organization filters with cuid2 ids', () => {
      const organizationId = 'b13yktd0f1e38me3f55swu0n';
      const query = {
        isDeleted: false,
        organizationId,
        sort: 'label: 1',
      } as BaseQueryDto;
      const superAdmin = {
        ...mockUser,
        publicMetadata: {
          ...(mockUser.publicMetadata as IAuthPublicMetadata),
          isSuperAdmin: true,
        },
      } as unknown as User;

      const result = controller.buildFindAllQuery(superAdmin, query);

      expect(result.where).toEqual({
        isDeleted: false,
        organizationId,
      });
      expect(result.orderBy).toEqual({ label: 1 });
    });

    it('scopes members to owned brands or their session organization', () => {
      const organizationId = (mockUser.publicMetadata as IAuthPublicMetadata)
        .organization;
      const query = {
        isDeleted: false,
        organizationId,
        sort: 'label: 1',
      } as BaseQueryDto;

      const result = controller.buildFindAllQuery(mockUser, query);

      expect(result.where).toEqual({
        isDeleted: false,
        OR: [
          { userId: (mockUser.publicMetadata as IAuthPublicMetadata).user },
          { organizationId },
        ],
      });
      expect(result.orderBy).toEqual({ label: 1 });
    });

    it('rejects member organization filters outside the session org', () => {
      const query = {
        isDeleted: false,
        organizationId: 'cmorganization000000000000002',
        sort: 'label: 1',
      } as BaseQueryDto;

      const call = () => controller.buildFindAllQuery(mockUser, query);

      expect(call).toThrow(ForbiddenException);

      try {
        call();
        expect.unreachable('expected a ForbiddenException');
      } catch (error) {
        expect((error as ForbiddenException).getResponse()).toEqual({
          detail: 'Access denied to this organization',
          title: 'Forbidden',
        });
      }
    });
  });

  describe('findOne', () => {
    it('should return a brand by id', async () => {
      const brandId = 'cmbrand000000000000000001';
      brandsService.findOne.mockResolvedValue(
        mockBrand as unknown as BrandEntity,
      );

      const result = await controller.findOne(mockRequest, mockUser, brandId);

      expect(brandsService.findOne).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should not be decorated with cache metadata', () => {
      const cacheMetadata = Reflect.getMetadata(
        'cache',
        Object.getPrototypeOf(controller),
        'findOne',
      );

      expect(cacheMetadata).toBeUndefined();
    });
  });

  describe('decorateForResponse', () => {
    it('attaches the brand credentials the serializer declares', async () => {
      credentialsService.find.mockResolvedValue([
        {
          brandId: mockBrand.id,
          id: 'cmcredential00000000000001',
          isConnected: true,
          platform: 'INSTAGRAM',
        },
      ] as never);

      const decorated = await controller.decorateForResponse(
        { ...mockBrand } as never,
        mockUser,
      );

      expect(credentialsService.find).toHaveBeenCalledWith({
        brandId: mockBrand.id,
        isDeleted: false,
        organizationId: mockBrand.organizationId,
      });
      expect(decorated.credentials).toEqual([
        expect.objectContaining({ id: 'cmcredential00000000000001' }),
      ]);
    });

    it('normalizes the Prisma credential platform to the domain vocabulary', async () => {
      credentialsService.find.mockResolvedValue([
        { id: 'credential-1', platform: 'GOOGLE_ADS' },
        { id: 'credential-2', platform: 'DEVTO' },
      ] as never);

      const decorated = await controller.decorateForResponse(
        { ...mockBrand } as never,
        mockUser,
      );

      // The UI, posts and OAuth routes all key off lowercase platform ids;
      // leaking the SCREAMING Prisma labels made every account read
      // "Not connected" on brand social settings.
      expect(decorated.credentials).toEqual([
        expect.objectContaining({ platform: 'google_ads' }),
        expect.objectContaining({ platform: 'devto' }),
      ]);
    });

    it('returns a copy rather than writing the relation onto the brand row', async () => {
      credentialsService.find.mockResolvedValue([
        { id: 'credential-1', platform: 'INSTAGRAM' },
      ] as never);
      const row = { ...mockBrand };

      const decorated = await controller.decorateForResponse(
        row as never,
        mockUser,
      );

      // The row handed in is whatever the service returned — a cached object or
      // a caller-held reference. Stamping `credentials` onto it leaks the
      // relation into every other reader of the same object.
      expect(row).not.toHaveProperty('credentials');
      expect(decorated).not.toBe(row);
      expect(decorated.credentials).toHaveLength(1);
    });

    it('leaves a brand without an organization untouched', async () => {
      const decorated = await controller.decorateForResponse(
        { ...mockBrand, organizationId: null } as never,
        mockUser,
      );

      expect(credentialsService.find).not.toHaveBeenCalled();
      expect(decorated.credentials).toBeUndefined();
    });
  });

  describe('crawlBrandKitWebsite', () => {
    it('verifies brand access and passes organization context to the service', async () => {
      const brandId = 'cmbrand000000000000000001';
      const draft = {
        assetCandidates: [],
        brandId,
        diagnostics: [],
        evidence: [],
        fields: {},
        id: brandId,
        readiness: {
          diagnostics: [],
          missingFields: [],
          requiredFields: [],
          score: 100,
          status: 'complete',
        },
        sourceType: 'website',
        status: 'ready',
      };
      brandsService.findOne.mockResolvedValue(
        mockBrand as unknown as BrandEntity,
      );
      brandsService.crawlWebsiteBrandKitDraft.mockResolvedValue(
        draft as Awaited<
          ReturnType<BrandsService['crawlWebsiteBrandKitDraft']>
        >,
      );

      const result = await agentConfigController.crawlBrandKitWebsite(
        mockRequest,
        mockUser,
        brandId,
        {
          url: 'https://acme.com',
        },
      );

      expect(brandsService.findOne).toHaveBeenCalledWith({
        OR: [
          { userId: 'cmuser0000000000000000001' },
          { organizationId: 'cmorganization000000000000001' },
        ],
        id: brandId,
      });
      expect(brandsService.crawlWebsiteBrandKitDraft).toHaveBeenCalledWith(
        brandId,
        'cmorganization000000000000001',
        { url: 'https://acme.com' },
      );
      expect(serializeSingle).toHaveBeenCalledWith(
        mockRequest,
        BrandKitSerializer,
        draft,
      );
      expect(result).toEqual({ data: draft });
    });

    it('rejects crawl requests without organization context', async () => {
      const brandId = 'c07f191e810c19729de860ee'.toString();
      const userWithoutOrganization = {
        ...mockUser,
        publicMetadata: {
          ...(mockUser.publicMetadata as IAuthPublicMetadata),
          organization: undefined,
        },
      } as unknown as User;
      brandsService.findOne.mockResolvedValue(
        mockBrand as unknown as BrandEntity,
      );

      await expect(
        agentConfigController.crawlBrandKitWebsite(
          mockRequest,
          userWithoutOrganization,
          brandId,
          {
            url: 'https://acme.com',
          },
        ),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          detail: 'Organization context is required',
        }),
      });
      expect(brandsService.crawlWebsiteBrandKitDraft).not.toHaveBeenCalled();
    });
  });

  describe('applyBrandKitDraft', () => {
    it('verifies brand access and passes organization context to the service', async () => {
      const brandId = 'c07f191e810c19729de860ee'.toString();
      const applyResult = {
        appliedFields: ['description'],
        brandId,
        diagnostics: [],
        id: brandId,
        preservedFields: [],
        status: 'accepted',
      };
      brandsService.findOne.mockResolvedValue(
        mockBrand as unknown as BrandEntity,
      );
      brandsService.applyBrandKitDraft.mockResolvedValue(
        applyResult as Awaited<ReturnType<BrandsService['applyBrandKitDraft']>>,
      );

      const result = await agentConfigController.applyBrandKitDraft(
        mockRequest,
        mockUser,
        brandId,
        {
          fields: {
            description: {
              action: 'accept',
              value: 'Updated brand description',
            },
          },
        },
      );

      expect(brandsService.findOne).toHaveBeenCalledWith({
        OR: [
          { userId: mockUser.publicMetadata.user },
          { organizationId: mockUser.publicMetadata.organization },
        ],
        id: brandId,
      });
      expect(brandsService.applyBrandKitDraft).toHaveBeenCalledWith(
        brandId,
        mockUser.publicMetadata.organization,
        {
          fields: {
            description: {
              action: 'accept',
              value: 'Updated brand description',
            },
          },
        },
      );
      expect(serializeSingle).toHaveBeenCalledWith(
        mockRequest,
        BrandKitApplySerializer,
        applyResult,
      );
      expect(result).toEqual({ data: applyResult });
    });

    it('rejects apply requests without organization context', async () => {
      const brandId = 'c07f191e810c19729de860ee'.toString();
      const userWithoutOrganization = {
        ...mockUser,
        publicMetadata: {
          ...(mockUser.publicMetadata as IAuthPublicMetadata),
          organization: undefined,
        },
      } as unknown as User;
      brandsService.findOne.mockResolvedValue(
        mockBrand as unknown as BrandEntity,
      );

      await expect(
        agentConfigController.applyBrandKitDraft(
          mockRequest,
          userWithoutOrganization,
          brandId,
          {
            fields: {
              description: {
                action: 'accept',
                value: 'Updated brand description',
              },
            },
          },
        ),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          detail: 'Organization context is required',
        }),
      });
      expect(brandsService.applyBrandKitDraft).not.toHaveBeenCalled();
    });
  });

  describe('createManualBrandKitDraft', () => {
    it('verifies brand access and passes manual intake to the service', async () => {
      const brandId = 'c07f191e810c19729de860ee'.toString();
      const dto = {
        description: 'Manual description',
        guidanceText: 'Write with practical proof.',
      };
      const draft = {
        assetCandidates: [],
        brandId,
        diagnostics: [],
        evidence: [],
        fields: {},
        id: brandId,
        readiness: {
          diagnostics: [],
          missingFields: [],
          requiredFields: [],
          score: 100,
          status: 'complete',
        },
        sourceType: 'manual',
        status: 'ready',
      };
      brandsService.findOne.mockResolvedValue(
        mockBrand as unknown as BrandEntity,
      );
      brandsService.buildManualBrandKitDraft.mockResolvedValue(
        draft as Awaited<ReturnType<BrandsService['buildManualBrandKitDraft']>>,
      );

      const result = await agentConfigController.createManualBrandKitDraft(
        mockRequest,
        mockUser,
        brandId,
        dto,
      );

      expect(brandsService.findOne).toHaveBeenCalledWith({
        OR: [
          { userId: mockUser.publicMetadata.user },
          { organizationId: mockUser.publicMetadata.organization },
        ],
        id: brandId,
      });
      expect(brandsService.buildManualBrandKitDraft).toHaveBeenCalledWith(
        brandId,
        mockUser.publicMetadata.organization,
        dto,
      );
      expect(serializeSingle).toHaveBeenCalledWith(
        mockRequest,
        BrandKitSerializer,
        draft,
      );
      expect(result).toEqual({ data: draft });
    });

    it('rejects manual intake without organization context', async () => {
      const brandId = 'c07f191e810c19729de860ee'.toString();
      const userWithoutOrganization = {
        ...mockUser,
        publicMetadata: {
          ...(mockUser.publicMetadata as IAuthPublicMetadata),
          organization: undefined,
        },
      } as unknown as User;
      brandsService.findOne.mockResolvedValue(
        mockBrand as unknown as BrandEntity,
      );

      await expect(
        agentConfigController.createManualBrandKitDraft(
          mockRequest,
          userWithoutOrganization,
          brandId,
          {
            description: 'Manual description',
          },
        ),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          detail: 'Organization context is required',
        }),
      });
      expect(brandsService.buildManualBrandKitDraft).not.toHaveBeenCalled();
    });
  });

  describe('importBrandKitAssets', () => {
    it('serializes the guarded asset import outcome', async () => {
      const brandId = 'c07f191e810c19729de860ee';
      const dto = {
        assets: [
          {
            candidateId: 'logo-candidate',
            role: 'logo' as const,
            sourceUrl: 'https://acme.com/logo.png',
          },
        ],
      };
      const importResult = {
        brandId,
        diagnostics: [],
        failedCandidateIds: [],
        id: brandId,
        importedAssetIds: ['asset-1'],
        results: [],
        skippedCandidateIds: [],
        status: 'accepted',
      };
      brandsService.findOne.mockResolvedValue(
        mockBrand as unknown as BrandEntity,
      );
      brandsService.importBrandKitAssets.mockResolvedValue(
        importResult as Awaited<
          ReturnType<BrandsService['importBrandKitAssets']>
        >,
      );

      const result = await agentConfigController.importBrandKitAssets(
        mockRequest,
        mockUser,
        brandId,
        dto,
      );

      expect(brandsService.importBrandKitAssets).toHaveBeenCalledWith(
        brandId,
        mockUser.publicMetadata.organization,
        mockUser.publicMetadata.user,
        dto,
      );
      expect(serializeSingle).toHaveBeenCalledWith(
        mockRequest,
        BrandKitAssetImportSerializer,
        importResult,
      );
      expect(result).toEqual({ data: importResult });
    });
  });
});
