import type { BrandEntity } from '@api/collections/brands/entities/brand.entity';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import type { AggregatePaginateResult } from '@api/types/aggregate-paginate-result';
import 'reflect-metadata';

import type {
  AuthenticatedUser,
  AuthenticatedUser as User,
} from '@api/auth/interfaces/authenticated-user.interface';
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
import { SkillsService } from '@api/collections/skills/services/skills.service';
import { VideosService } from '@api/collections/videos/services/videos.service';
import { CREDITS_KEY } from '@api/helpers/decorators/credits/credits.decorator';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import type { IBrandOsDraftHandoff } from '@genfeedai/interfaces';
import {
  BrandKitApplySerializer,
  BrandKitAssetImportSerializer,
  BrandKitSerializer,
  BrandOsDraftHandoffSerializer,
  BrandSerializer,
} from '@genfeedai/serializers';
import { testId } from '@helpers/testing/test-id.helper';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
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
  let brandsService: vi.Mocked<BrandsService>;
  let credentialsService: vi.Mocked<CredentialsService>;
  let _loggerService: vi.Mocked<LoggerService>;

  const mockUser = {
    id: 'user-123',
    brandId: 'cmbrand000000000000000001',
    isSuperAdmin: false,
    organizationId: 'cmorganization000000000000001',
    userId: 'cmuser0000000000000000001',
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
            claimBrandOsPreview: vi.fn(),
            crawlWebsiteBrandKitDraft: vi.fn(),
            create: vi.fn(),
            findAll: vi.fn(),
            findOne: vi.fn(),
            findOneBySlug: vi.fn(),
            generateBrandVoice: vi.fn(),
            importBrandKitAssets: vi.fn(),
            patch: vi.fn(),
            readClaimedBrandOsPreview: vi.fn(),
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
          provide: SkillsService,
          useValue: { assertAccessibleSkillSlugs: vi.fn() },
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
      brand: testId('brand'),
      brandId: testId('brand'),
      label: 'Renamed Brand',
      organization: testId('brand'),
      user: testId('brand'),
      userId: testId('brand'),
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

  it('rejects agentConfig through the generic brand patch', async () => {
    await expect(
      controller.patch(mockRequest, mockUser, mockBrand.id, {
        agentConfig: { persona: 'Replacement' },
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(brandsService.patch).not.toHaveBeenCalled();
    expect(brandSetupService.updateBrandNameById).not.toHaveBeenCalled();
  });

  it('routes an explicit organization change through the relocation operation', async () => {
    const brandId = testId('brand');
    const destinationOrganizationId = testId('org', 2);
    const summary = {
      membersSevered: 0,
      schedulingPending: 0,
      workflowsClonedActive: 0,
      workflowsClonedPaused: 0,
      workflowsMoved: 0,
    };
    brandsService.findOne.mockResolvedValue({
      ...mockBrand,
      organizationId: testId('brand'),
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
        userId: mockUser.userId,
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
      };

      const result = await controller.findAll(mockRequest, mockUser, query);

      expect(brandsService.findAll).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe('buildFindAllQuery', () => {
    it('honors superadmin organization filters with cuid2 ids', () => {
      // Hand-written cuid2-shaped fixture (24 chars, low entropy) — this test
      // targets the cuid2 id shape specifically, so `testId()`'s 25-char cuid
      // output would not exercise the same branch.
      const organizationId = 'borg00000000000000000001';
      const query = {
        isDeleted: false,
        organizationId,
        sort: 'label: 1',
      } as BaseQueryDto;
      const superAdmin = {
        ...mockUser,
        ...mockUser,
        isSuperAdmin: true,
      } as unknown as User;

      const result = controller.buildFindAllQuery(superAdmin, query);

      expect(result.where).toEqual({
        isDeleted: false,
        organizationId,
      });
      expect(result.orderBy).toEqual({ label: 1 });
    });

    it('scopes members to owned brands or their session organization', () => {
      const organizationId = (mockUser as AuthenticatedUser).organizationId;
      const query = {
        isDeleted: false,
        organizationId,
        sort: 'label: 1',
      } as BaseQueryDto;

      const result = controller.buildFindAllQuery(mockUser, query);

      expect(result.where).toEqual({
        isDeleted: false,
        OR: [{ userId: mockUser.userId }, { organizationId }],
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
      const brandId = testId('brand');
      const userWithoutOrganization = {
        ...mockUser,
        ...mockUser,
        organizationId: undefined,
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

  describe('Brand OS preview handoff', () => {
    const brandId = 'cmbrand000000000000000001';
    const handoff: IBrandOsDraftHandoff = {
      draft: {
        assetCandidates: [],
        brandId,
        diagnostics: [],
        evidence: [],
        fields: {},
        id: brandId,
        organizationId: mockUser.organizationId,
        readiness: {
          diagnostics: [],
          missingFields: [],
          requiredFields: [],
          score: 100,
          status: 'complete',
        },
        sourceType: 'manual',
        status: 'ready',
      },
      expiresAt: '2026-08-26T12:30:00.000Z',
      id: brandId,
      status: 'claimed',
    };

    it('verifies access, tenant-binds, and serializes a one-time claim', async () => {
      brandsService.findOne.mockResolvedValue(
        mockBrand as unknown as BrandEntity,
      );
      brandsService.claimBrandOsPreview.mockResolvedValue(handoff);

      const result = await agentConfigController.claimBrandOsPreview(
        mockRequest,
        mockUser,
        brandId,
        { previewToken: 'a'.repeat(43) },
      );

      expect(brandsService.findOne).toHaveBeenCalledWith({
        OR: [
          { userId: mockUser.userId },
          { organizationId: mockUser.organizationId },
        ],
        id: brandId,
      });
      expect(brandsService.claimBrandOsPreview).toHaveBeenCalledWith(
        brandId,
        mockUser.organizationId,
        'a'.repeat(43),
      );
      expect(serializeSingle).toHaveBeenCalledWith(
        mockRequest,
        BrandOsDraftHandoffSerializer,
        handoff,
      );
      expect(result).toEqual({ data: handoff });
    });

    it('verifies access and tenant scope before reading a claimed draft', async () => {
      brandsService.findOne.mockResolvedValue(
        mockBrand as unknown as BrandEntity,
      );
      brandsService.readClaimedBrandOsPreview.mockResolvedValue(handoff);

      const result = await agentConfigController.readClaimedBrandOsPreview(
        mockRequest,
        mockUser,
        brandId,
      );

      expect(brandsService.readClaimedBrandOsPreview).toHaveBeenCalledWith(
        brandId,
        mockUser.organizationId,
      );
      expect(serializeSingle).toHaveBeenCalledWith(
        mockRequest,
        BrandOsDraftHandoffSerializer,
        handoff,
      );
      expect(result).toEqual({ data: handoff });
    });

    it('does not consume the token without organization context', async () => {
      brandsService.findOne.mockResolvedValue(
        mockBrand as unknown as BrandEntity,
      );

      await expect(
        agentConfigController.claimBrandOsPreview(
          mockRequest,
          { ...mockUser, organizationId: undefined } as unknown as User,
          brandId,
          { previewToken: 'a'.repeat(43) },
        ),
      ).rejects.toMatchObject({ status: 403 });

      expect(brandsService.claimBrandOsPreview).not.toHaveBeenCalled();
    });
  });

  describe('applyBrandKitDraft', () => {
    it('verifies brand access and passes organization context to the service', async () => {
      const brandId = testId('brand');
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
          { userId: mockUser.userId },
          { organizationId: mockUser.organizationId },
        ],
        id: brandId,
      });
      expect(brandsService.applyBrandKitDraft).toHaveBeenCalledWith(
        brandId,
        mockUser.organizationId,
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
      const brandId = testId('brand');
      const userWithoutOrganization = {
        ...mockUser,
        ...mockUser,
        organizationId: undefined,
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
      const brandId = testId('brand');
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
          { userId: mockUser.userId },
          { organizationId: mockUser.organizationId },
        ],
        id: brandId,
      });
      expect(brandsService.buildManualBrandKitDraft).toHaveBeenCalledWith(
        brandId,
        mockUser.organizationId,
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
      const brandId = testId('brand');
      const userWithoutOrganization = {
        ...mockUser,
        ...mockUser,
        organizationId: undefined,
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
      const brandId = testId('brand');
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
        mockUser.organizationId,
        mockUser.userId,
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
