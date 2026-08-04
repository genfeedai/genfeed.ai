import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';

// Real, schema-derived getModelMeta/PRISMA_MODEL_METADATA.Brand (fontFamily +
// scope enum fields) via the light @genfeedai/prisma/testing subpath — no
// heavy PrismaClient/runtime import required.
vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

import { BrandGenerationService } from '@api/collections/brands/services/brand-generation.service';
import { BrandKitAssetsService } from '@api/collections/brands/services/brand-kit-assets.service';
import { BrandKitDraftService } from '@api/collections/brands/services/brand-kit-draft.service';
import type { BrandRelocationService } from '@api/collections/brands/services/brand-relocation.service';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CACHE_PATTERNS } from '@api/common/constants/cache-patterns.constants';
import type { AccessBootstrapCacheService } from '@api/common/services/access-bootstrap-cache.service';
import { CacheInvalidationService } from '@api/common/services/cache-invalidation.service';
import { BrandScraperService } from '@api/services/brand-scraper/brand-scraper.service';
import { CacheService } from '@api/services/cache/services/cache.service';
import { LlmDispatcherService } from '@api/services/integrations/llm/llm-dispatcher.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { FastlaneFormat } from '@genfeedai/interfaces';
import type { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException } from '@nestjs/common';
import { FilesClientService } from '@server/services/files-microservice/client/files-client.service';

describe('BrandsService', () => {
  let service: BrandsService;
  let delegate: Record<string, ReturnType<typeof vi.fn>>;
  let assetDelegate: Record<string, ReturnType<typeof vi.fn>>;
  let brandScraperService: {
    scrapeWebsite: ReturnType<typeof vi.fn>;
    validateUrl: ReturnType<typeof vi.fn>;
  };
  let cacheInvalidationService: {
    invalidate: ReturnType<typeof vi.fn>;
    invalidateByTags: ReturnType<typeof vi.fn>;
    invalidatePattern: ReturnType<typeof vi.fn>;
  };
  let accessBootstrapCacheService: {
    invalidateForOrganization: ReturnType<typeof vi.fn>;
  };
  let filesClientService: { uploadToS3: ReturnType<typeof vi.fn> };
  let llmDispatcher: { chatCompletion: ReturnType<typeof vi.fn> };
  let loggerService: LoggerService;

  beforeEach(() => {
    brandScraperService = {
      scrapeWebsite: vi.fn(),
      validateUrl: vi.fn(),
    };
    llmDispatcher = { chatCompletion: vi.fn() };
    delegate = {
      count: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    };
    assetDelegate = {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    };
    cacheInvalidationService = {
      invalidate: vi.fn(),
      invalidateByTags: vi.fn(),
      invalidatePattern: vi.fn(),
    };
    accessBootstrapCacheService = {
      invalidateForOrganization: vi.fn().mockResolvedValue(undefined),
    };
    filesClientService = {
      uploadToS3: vi.fn(),
    };
    loggerService = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    } as unknown as LoggerService;

    const prisma = {
      asset: assetDelegate,
      brand: delegate,
    } as unknown as PrismaService;

    service = new BrandsService(
      prisma,
      loggerService,
      { invalidateByTags: vi.fn() } as unknown as CacheService,
      cacheInvalidationService as unknown as CacheInvalidationService,
      accessBootstrapCacheService as unknown as AccessBootstrapCacheService,
      {} as unknown as BrandRelocationService,
      new BrandGenerationService(
        brandScraperService as unknown as BrandScraperService,
        llmDispatcher as unknown as LlmDispatcherService,
        loggerService,
      ),
      new BrandKitAssetsService(
        prisma,
        cacheInvalidationService as unknown as CacheInvalidationService,
        filesClientService as unknown as FilesClientService,
        { cdnUrl: 'https://cdn.example.com' } as unknown as ConfigService,
      ),
      new BrandKitDraftService(
        brandScraperService as unknown as BrandScraperService,
      ),
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('create', () => {
    const createBrandDto = {
      backgroundColor: '#000000',
      fontFamily: 'MONTSERRAT_BLACK',
      isSelected: true,
      label: 'Default Brand',
      primaryColor: '#000000',
      secondaryColor: '#FFFFFF',
      slug: 'default-brand',
    };

    it('retries with a deterministic suffix when two creates race on the same slug', async () => {
      const collision = {
        code: 'P2002',
        meta: { target: ['slug'] },
      };
      delegate.create.mockRejectedValueOnce(collision).mockResolvedValueOnce({
        ...createBrandDto,
        id: 'brand-winner',
        organizationId: 'org-1',
        slug: 'default-brand-2',
        userId: 'user-1',
      });

      const brand = await service.create({
        ...createBrandDto,
        organizationId: 'org-1',
        userId: 'user-1',
      });

      expect(brand.slug).toBe('default-brand-2');
      expect(delegate.create).toHaveBeenCalledTimes(2);
      const firstCall = delegate.create.mock.calls[0]?.[0] as
        | { data: { slug: string } }
        | undefined;
      const secondCall = delegate.create.mock.calls[1]?.[0] as
        | { data: { slug: string } }
        | undefined;
      expect(firstCall?.data.slug).toBe('default-brand');
      expect(secondCall?.data.slug).toBe('default-brand-2');
    });

    it('maps controller metadata aliases to canonical Prisma foreign keys', async () => {
      delegate.create.mockResolvedValue({
        ...createBrandDto,
        id: 'brand-1',
        organizationId: 'org-1',
        userId: 'user-1',
      });

      await service.create({
        ...createBrandDto,
        // Session stamp from BaseCRUD.enrichCreateDto (current brand) must not
        // reach prisma.brand.create — Brand has no `brand` argument.
        brand: 'session-brand-id',
        organization: 'org-1',
        user: 'user-1',
      });

      const createInput = delegate.create.mock.calls[0]?.[0] as {
        data: Record<string, unknown>;
      };
      expect(createInput.data).toMatchObject({
        organizationId: 'org-1',
        userId: 'user-1',
      });
      expect(createInput.data).not.toHaveProperty('organization');
      expect(createInput.data).not.toHaveProperty('user');
      expect(createInput.data).not.toHaveProperty('brand');
      expect(createInput.data).not.toHaveProperty('brandId');
      expect(cacheInvalidationService.invalidate).toHaveBeenCalledWith(
        CACHE_PATTERNS.BRANDS_LIST('org-1'),
      );
      expect(
        accessBootstrapCacheService.invalidateForOrganization,
      ).toHaveBeenCalledWith('org-1');
    });

    it('prefers canonical foreign keys over legacy metadata aliases', async () => {
      delegate.create.mockResolvedValue({
        ...createBrandDto,
        id: 'brand-1',
        organizationId: 'org-canonical',
        userId: 'user-canonical',
      });

      await service.create({
        ...createBrandDto,
        organization: 'org-legacy',
        organizationId: 'org-canonical',
        user: 'user-legacy',
        userId: 'user-canonical',
      });

      const createInput = delegate.create.mock.calls[0]?.[0] as {
        data: Record<string, unknown>;
      };
      expect(createInput.data).toMatchObject({
        organizationId: 'org-canonical',
        userId: 'user-canonical',
      });
      expect(createInput.data).not.toHaveProperty('organization');
      expect(createInput.data).not.toHaveProperty('user');
    });
  });

  describe('patch', () => {
    it('strips session brand alias so Prisma update does not receive brand', async () => {
      const existing = {
        id: 'brand-1',
        label: 'Default Brand',
        organizationId: 'org-1',
        slug: 'default',
      };
      delegate.findFirst.mockResolvedValue(existing);
      delegate.update.mockResolvedValue({
        ...existing,
        label: 'Renamed',
      });

      // BrandsService extends BaseService — super.patch looks up then updates.
      // Spy the parent path via delegate methods the base service uses.
      const result = await service.patch('brand-1', {
        brand: 'session-brand-id',
        brandId: 'session-brand-id',
        label: 'Renamed',
        organization: 'org-1',
        user: 'user-1',
        userId: 'user-canonical-id',
      } as never);

      expect(result.label).toBe('Renamed');
      const updateCall = delegate.update.mock.calls.at(-1)?.[0] as
        | { data: Record<string, unknown> }
        | undefined;
      expect(updateCall?.data).toMatchObject({ label: 'Renamed' });
      expect(updateCall?.data).not.toHaveProperty('brand');
      expect(updateCall?.data).not.toHaveProperty('brandId');
      expect(updateCall?.data).not.toHaveProperty('organization');
      expect(updateCall?.data).not.toHaveProperty('user');
      expect(updateCall?.data).not.toHaveProperty('userId');
      expect(
        accessBootstrapCacheService.invalidateForOrganization,
      ).toHaveBeenCalledWith('org-1');
    });

    it('omits undefined DTO fields so Prisma never receives undefined write keys', async () => {
      const existing = {
        id: 'brand-1',
        label: 'Default Brand',
        organizationId: 'org-1',
        slug: 'default',
      };
      delegate.findFirst.mockResolvedValue(existing);
      delegate.update.mockResolvedValue({
        ...existing,
        label: 'Renamed',
      });

      await service.patch('brand-1', {
        description: undefined,
        label: 'Renamed',
        primaryColor: undefined,
        user: 'user-session-id',
      } as never);

      const updateCall = delegate.update.mock.calls.at(-1)?.[0] as
        | { data: Record<string, unknown> }
        | undefined;
      expect(updateCall?.data).toEqual({ label: 'Renamed' });
      expect(updateCall?.data).not.toHaveProperty('description');
      expect(updateCall?.data).not.toHaveProperty('primaryColor');
      expect(updateCall?.data).not.toHaveProperty('user');
    });
  });

  it('resolves legacy mongo ids before selecting a brand', async () => {
    const legacyBrandId = '69d65211cbce660360fd068d';
    const currentBrandId = 'hkh2jbovtpcsrzw3oyxr11oj';
    const organizationId = 'b13yktd0f1e38me3f55swu0n';
    const userId = 'user_current';

    delegate.findFirst
      .mockResolvedValueOnce({
        id: currentBrandId,
        isDeleted: false,
        mongoId: legacyBrandId,
        organizationId,
        userId,
      })
      .mockResolvedValueOnce({
        id: currentBrandId,
        isDeleted: false,
        isSelected: true,
        mongoId: legacyBrandId,
        organizationId,
        userId,
      });
    delegate.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.selectBrandForUser(
      legacyBrandId,
      userId,
      organizationId,
    );

    expect(delegate.findFirst).toHaveBeenNthCalledWith(1, {
      where: {
        OR: [{ id: legacyBrandId }, { mongoId: legacyBrandId }],
        isDeleted: false,
        organizationId,
      },
    });
    expect(delegate.updateMany).toHaveBeenNthCalledWith(2, {
      data: { isSelected: true },
      where: { id: currentBrandId, isDeleted: false, organizationId },
    });
    // Normalized records expose only the canonical Prisma id (#1096); the
    // mongoId input above still resolves via the OR lookup.
    expect(result).toMatchObject({
      id: currentBrandId,
      isSelected: true,
    });
  });

  it('throws when the target brand cannot be resolved', async () => {
    delegate.findFirst.mockResolvedValue(null);

    await expect(
      service.selectBrandForUser(
        'brand_missing',
        'user_current',
        'org_current',
      ),
    ).rejects.toThrow(NotFoundException);
    expect(delegate.updateMany).not.toHaveBeenCalled();
  });

  describe('crawlWebsiteBrandKitDraft', () => {
    const organizationId = 'org_1';
    const brandId = 'brand_1';

    it('returns a website-sourced draft without mutating the brand', async () => {
      brandScraperService.validateUrl.mockReturnValue({ isValid: true });
      brandScraperService.scrapeWebsite.mockResolvedValue({
        bannerUrl: 'https://acme.com/hero.jpg',
        companyName: 'Acme Website',
        description: 'Website description',
        fontCandidates: ['Inter'],
        logoUrl: 'https://acme.com/logo.svg',
        primaryColor: '#3366ff',
        referenceImageUrls: ['https://acme.com/reference.jpg'],
        scrapedAt: new Date('2026-06-30T10:00:00Z'),
        sourceUrl: 'https://acme.com',
      });
      delegate.findFirst.mockResolvedValue({
        id: brandId,
        isDeleted: false,
        label: 'Current Acme',
        organization: { id: organizationId },
        organizationId,
      });

      const draft = await service.crawlWebsiteBrandKitDraft(
        brandId,
        organizationId,
        {
          socialUrls: ['https://linkedin.com/company/acme'],
          url: 'https://acme.com',
        },
      );

      expect(delegate.findFirst).toHaveBeenCalledWith({
        where: { id: brandId, isDeleted: false, organizationId },
      });
      expect(brandScraperService.scrapeWebsite).toHaveBeenCalledWith(
        'https://acme.com',
      );
      expect(delegate.update).not.toHaveBeenCalled();
      expect(delegate.updateMany).not.toHaveBeenCalled();
      expect(draft.sourceType).toBe('website');
      expect(draft.fields.label?.currentValue).toBe('Current Acme');
      expect(draft.fields.label?.proposedValue).toBe('Acme Website');
      expect(draft.fields.fontFamily?.proposedValue).toBe('Inter');
      expect(draft.assetCandidates).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ role: 'logo' }),
          expect.objectContaining({ role: 'banner' }),
          expect.objectContaining({ role: 'reference' }),
        ]),
      );
    });

    it('rejects invalid website URLs before fetching', async () => {
      brandScraperService.validateUrl.mockReturnValue({
        error: 'Local URLs are not allowed',
        isValid: false,
      });

      await expect(
        service.crawlWebsiteBrandKitDraft(brandId, organizationId, {
          url: 'http://127.0.0.1',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(brandScraperService.scrapeWebsite).not.toHaveBeenCalled();
      expect(delegate.findFirst).not.toHaveBeenCalled();
    });

    it('returns a blocked draft when crawling fails after validation', async () => {
      brandScraperService.validateUrl.mockReturnValue({ isValid: true });
      brandScraperService.scrapeWebsite.mockRejectedValue(
        new Error('Unsupported content type: application/pdf'),
      );
      delegate.findFirst.mockResolvedValue({
        id: brandId,
        isDeleted: false,
        label: 'Current Acme',
        organization: { id: organizationId },
        organizationId,
      });

      const draft = await service.crawlWebsiteBrandKitDraft(
        brandId,
        organizationId,
        { url: 'https://acme.com/file.pdf' },
      );

      expect(draft.status).toBe('blocked');
      expect(draft.diagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'brand_kit_website_crawl_failed',
            severity: 'error',
          }),
        ]),
      );
      expect(delegate.update).not.toHaveBeenCalled();
    });
  });

  describe('importBrandKitAssets', () => {
    const organizationId = 'org_1';
    const userId = 'user_1';
    const brandId = 'brand_1';

    beforeEach(() => {
      delegate.findFirst.mockResolvedValue({
        id: brandId,
        isDeleted: false,
        organizationId,
      });
      assetDelegate.create.mockResolvedValue({
        id: 'asset_new',
      });
      assetDelegate.update.mockResolvedValue({ id: 'asset_new' });
      assetDelegate.updateMany.mockResolvedValue({ count: 1 });
      filesClientService.uploadToS3.mockResolvedValue({
        publicUrl: 'https://cdn.example.com/asset_new',
        size: 42_000,
      });
    });

    it('blocks empty import requests', async () => {
      const result = await service.importBrandKitAssets(
        brandId,
        organizationId,
        userId,
        { assets: [] },
      );

      expect(assetDelegate.create).not.toHaveBeenCalled();
      expect(filesClientService.uploadToS3).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        diagnostics: [
          expect.objectContaining({ code: 'brand_kit_asset_import_empty' }),
        ],
        status: 'blocked',
      });
    });

    it('imports an accepted logo candidate and replaces the existing logo after upload succeeds', async () => {
      assetDelegate.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'asset_old' });

      const result = await service.importBrandKitAssets(
        brandId,
        organizationId,
        userId,
        {
          assets: [
            {
              candidateId: 'logo-candidate',
              label: 'Website logo',
              mimeType: 'image/png',
              replaceExisting: true,
              role: 'logo',
              sourceType: 'website',
              url: 'https://acme.example/logo.png',
            },
          ],
        },
      );

      expect(assetDelegate.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          category: 'LOGO',
          origin: 'https://acme.example/logo.png',
          parentBrandId: brandId,
          parentOrgId: organizationId,
          parentType: 'BRAND',
          userId,
        }),
      });
      expect(filesClientService.uploadToS3).toHaveBeenCalledWith(
        'asset_new',
        'logos',
        {
          type: 'url',
          url: 'https://acme.example/logo.png',
        },
      );
      expect(assetDelegate.update).toHaveBeenCalledWith({
        data: expect.objectContaining({
          cloudObjectKey: 'logos/asset_new',
        }),
        where: { id: 'asset_new' },
      });
      expect(assetDelegate.updateMany).toHaveBeenCalledWith({
        data: { isDeleted: true },
        where: expect.objectContaining({
          category: 'LOGO',
          id: { not: 'asset_new' },
          parentBrandId: brandId,
          parentOrgId: organizationId,
        }),
      });
      expect(cacheInvalidationService.invalidate).toHaveBeenCalled();
      expect(cacheInvalidationService.invalidateByTags).toHaveBeenCalledWith([
        'brands',
        'assets',
        'links',
        'public',
      ]);
      expect(result).toMatchObject({
        importedAssetIds: ['asset_new'],
        status: 'accepted',
      });
    });

    it('preserves an existing logo unless replacement is explicit', async () => {
      assetDelegate.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'asset_old' });

      const result = await service.importBrandKitAssets(
        brandId,
        organizationId,
        userId,
        {
          assets: [
            {
              candidateId: 'logo-candidate',
              mimeType: 'image/png',
              role: 'logo',
              url: 'https://acme.example/logo.png',
            },
          ],
        },
      );

      expect(assetDelegate.create).not.toHaveBeenCalled();
      expect(filesClientService.uploadToS3).not.toHaveBeenCalled();
      expect(result.status).toBe('blocked');
      expect(result.results[0]).toMatchObject({
        status: 'skipped',
        diagnostics: [
          expect.objectContaining({
            code: 'brand_kit_asset_existing_preserved',
          }),
        ],
      });
    });

    it('skips a candidate that was already imported for the brand', async () => {
      assetDelegate.findFirst.mockResolvedValueOnce({ id: 'asset_existing' });

      const result = await service.importBrandKitAssets(
        brandId,
        organizationId,
        userId,
        {
          assets: [
            {
              candidateId: 'logo-candidate',
              mimeType: 'image/png',
              role: 'logo',
              url: 'https://acme.example/logo.png',
            },
          ],
        },
      );

      expect(assetDelegate.create).not.toHaveBeenCalled();
      expect(result.results[0]).toMatchObject({
        assetId: 'asset_existing',
        status: 'skipped',
      });
    });

    it('imports reference candidates without deleting existing references by default', async () => {
      assetDelegate.findFirst.mockResolvedValueOnce(null);

      const result = await service.importBrandKitAssets(
        brandId,
        organizationId,
        userId,
        {
          assets: [
            {
              candidateId: 'reference-candidate',
              mimeType: 'image/webp',
              role: 'reference',
              url: 'https://acme.example/reference.webp',
            },
          ],
        },
      );

      expect(filesClientService.uploadToS3).toHaveBeenCalledWith(
        'asset_new',
        'references',
        {
          type: 'url',
          url: 'https://acme.example/reference.webp',
        },
      );
      expect(assetDelegate.updateMany).not.toHaveBeenCalled();
      expect(result.status).toBe('accepted');
    });

    it('rejects private asset URLs before creating an asset', async () => {
      const result = await service.importBrandKitAssets(
        brandId,
        organizationId,
        userId,
        {
          assets: [
            {
              candidateId: 'private-candidate',
              mimeType: 'image/png',
              role: 'logo',
              url: 'http://127.0.0.1/logo.png',
            },
          ],
        },
      );

      expect(assetDelegate.findFirst).not.toHaveBeenCalled();
      expect(assetDelegate.create).not.toHaveBeenCalled();
      expect(result.status).toBe('blocked');
      expect(result.results[0]).toMatchObject({
        status: 'failed',
        diagnostics: [
          expect.objectContaining({ code: 'brand_kit_asset_invalid_url' }),
        ],
      });
    });

    it('removes the created asset record when remote upload fails', async () => {
      assetDelegate.findFirst.mockResolvedValueOnce(null);
      filesClientService.uploadToS3.mockRejectedValueOnce(
        new Error('download failed'),
      );

      const result = await service.importBrandKitAssets(
        brandId,
        organizationId,
        userId,
        {
          assets: [
            {
              candidateId: 'reference-candidate',
              mimeType: 'image/jpeg',
              role: 'reference',
              url: 'https://acme.example/reference.jpg',
            },
          ],
        },
      );

      expect(assetDelegate.update).toHaveBeenCalledWith({
        data: { isDeleted: true },
        where: { id: 'asset_new' },
      });
      expect(result.results[0]).toMatchObject({
        status: 'failed',
        diagnostics: [
          expect.objectContaining({ code: 'brand_kit_asset_import_failed' }),
        ],
      });
    });
  });

  describe('applyBrandKitDraft', () => {
    const organizationId = 'org_1';
    const brandId = 'brand_1';

    it('applies selected scalar, voice, and strategy fields to the brand', async () => {
      delegate.findFirst.mockResolvedValue({
        agentConfig: {
          strategy: { frequency: 'weekly' },
          voice: { style: 'direct' },
        },
        id: brandId,
        isDeleted: false,
        organizationId,
      });
      delegate.update.mockResolvedValue({
        description: 'Imported description',
        id: brandId,
        organizationId,
      });

      const result = await service.applyBrandKitDraft(brandId, organizationId, {
        fields: {
          description: {
            action: 'accept',
            value: 'Imported description',
          },
          strategyPlatforms: {
            action: 'accept',
            value: ['linkedin', 'youtube'],
          },
          voiceTone: {
            action: 'accept',
            value: 'Confident',
          },
        },
      });

      expect(delegate.findFirst).toHaveBeenCalledWith({
        where: { id: brandId, isDeleted: false, organizationId },
      });
      expect(delegate.update).toHaveBeenCalledWith({
        data: {
          agentConfig: {
            strategy: {
              frequency: 'weekly',
              platforms: ['linkedin', 'youtube'],
            },
            voice: {
              style: 'direct',
              tone: 'Confident',
            },
          },
          description: 'Imported description',
        },
        where: { id: brandId },
      });
      expect(result).toEqual({
        appliedFields: ['description', 'strategyPlatforms', 'voiceTone'],
        brandId,
        diagnostics: [],
        id: brandId,
        preservedFields: [],
        status: 'accepted',
      });
    });

    it('preserves links and assets until the safe asset import child ships', async () => {
      delegate.findFirst.mockResolvedValue({
        agentConfig: {},
        id: brandId,
        isDeleted: false,
        organizationId,
      });

      const result = await service.applyBrandKitDraft(brandId, organizationId, {
        fields: {
          logo: {
            action: 'accept',
            value: {
              role: 'logo',
              sourceType: 'website',
              url: 'https://acme.test/logo.svg',
            },
          },
          socialLinks: {
            action: 'accept',
            value: [{ platform: 'linkedin', url: 'https://linkedin.test' }],
          },
        },
      });

      expect(delegate.update).not.toHaveBeenCalled();
      expect(result.appliedFields).toEqual([]);
      expect(result.preservedFields).toEqual(['logo', 'socialLinks']);
      expect(result.status).toBe('partial');
      expect(result.diagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'brand_kit_apply_deferred_field',
            fieldKey: 'logo',
            severity: 'warning',
          }),
          expect.objectContaining({
            code: 'brand_kit_apply_deferred_field',
            fieldKey: 'socialLinks',
            severity: 'warning',
          }),
        ]),
      );
    });

    it('rejects unsupported font candidates without mutating the brand', async () => {
      delegate.findFirst.mockResolvedValue({
        agentConfig: {},
        id: brandId,
        isDeleted: false,
        organizationId,
      });

      const result = await service.applyBrandKitDraft(brandId, organizationId, {
        fields: {
          fontFamily: {
            action: 'accept',
            value: 'Inter',
          },
        },
      });

      expect(delegate.update).not.toHaveBeenCalled();
      expect(result.status).toBe('blocked');
      expect(result.diagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'brand_kit_apply_invalid_value',
            fieldKey: 'fontFamily',
            severity: 'error',
          }),
        ]),
      );
    });
  });

  describe('buildManualBrandKitDraft', () => {
    const organizationId = 'org_1';
    const brandId = 'brand_1';

    it('returns a manual-sourced draft without mutating the brand', async () => {
      delegate.findFirst.mockResolvedValue({
        id: brandId,
        isDeleted: false,
        label: 'Current Acme',
        organization: { id: organizationId },
        organizationId,
        primaryColor: '#000000',
      });

      const draft = await service.buildManualBrandKitDraft(
        brandId,
        organizationId,
        {
          assets: [
            {
              id: 'logo-upload',
              label: 'Uploaded logo',
              role: 'logo',
              url: 'https://cdn.example.com/logo.png',
            },
          ],
          description: 'Manual description',
          guidanceDocumentName: 'brand-guide.txt',
          guidanceText: 'Write with proof and short sentences.',
          primaryColor: '#3355ff',
          voiceTone: 'confident',
        },
      );

      expect(delegate.findFirst).toHaveBeenCalledWith({
        where: { id: brandId, isDeleted: false, organizationId },
      });
      expect(delegate.update).not.toHaveBeenCalled();
      expect(delegate.updateMany).not.toHaveBeenCalled();
      expect(draft.sourceType).toBe('manual');
      expect(draft.fields.description?.proposedValue).toBe(
        'Manual description',
      );
      expect(draft.fields.primaryColor?.proposedValue).toBe('#3355ff');
      expect(draft.fields.promptGuidelines?.proposedValue).toContain(
        'short sentences',
      );
      expect(draft.fields.voiceTone?.proposedValue).toBe('confident');
      expect(draft.fields.logo?.proposedValue).toMatchObject({
        id: 'logo-upload',
        role: 'logo',
      });
    });

    it('rejects empty manual intake before loading the brand', async () => {
      await expect(
        service.buildManualBrandKitDraft(brandId, organizationId, {}),
      ).rejects.toThrow(BadRequestException);

      expect(delegate.findFirst).not.toHaveBeenCalled();
    });

    it('rejects unsupported guidance document names', async () => {
      await expect(
        service.buildManualBrandKitDraft(brandId, organizationId, {
          guidanceDocumentName: 'brand-guide.pdf',
          guidanceText: 'Guidance',
        }),
      ).rejects.toThrow(BadRequestException);

      expect(delegate.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('generateFastlaneIdeas', () => {
    const organizationId = 'org_1';
    const brandId = 'brand_1';

    it('returns normalized ideas with unique generated ids for a configured brand', async () => {
      delegate.findFirst.mockResolvedValue({
        agentConfig: { voice: { tone: 'bold' } },
        description: 'A bold brand',
        id: brandId,
        isDeleted: false,
        label: 'Acme',
        organizationId,
      });
      llmDispatcher.chatCompletion.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify([
                {
                  caption: 'cap',
                  format: 'image',
                  hook: 'hook',
                  platformHints: ['tiktok'],
                  visualPrompt: 'a scene',
                },
                {
                  caption: 'cap2',
                  format: 'avatar',
                  hook: 'hook2',
                  platformHints: ['instagram'],
                  speechText: 'hello there',
                  visualPrompt: '',
                },
              ]),
            },
          },
        ],
      });

      const result = await service.generateFastlaneIdeas(
        brandId,
        { count: 2, formats: ['image', 'avatar'] as FastlaneFormat[] },
        organizationId,
      );

      expect(llmDispatcher.chatCompletion).toHaveBeenCalledTimes(1);
      expect(result).toHaveLength(2);
      expect(result[0].id).toBeTruthy();
      expect(result[1].id).toBeTruthy();
      expect(result[0].id).not.toEqual(result[1].id);
      expect(result[0].format).toBe('image');
      expect(result[1].speechText).toBe('hello there');
    });

    it('throws NotFoundException when the brand is not found', async () => {
      delegate.findFirst.mockResolvedValue(null);

      await expect(
        service.generateFastlaneIdeas(
          brandId,
          { count: 2, formats: ['image'] as FastlaneFormat[] },
          organizationId,
        ),
      ).rejects.toThrow(NotFoundException);
      expect(llmDispatcher.chatCompletion).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the brand voice is not configured', async () => {
      delegate.findFirst.mockResolvedValue({
        agentConfig: {},
        id: brandId,
        isDeleted: false,
        label: 'Acme',
        organizationId,
      });

      await expect(
        service.generateFastlaneIdeas(
          brandId,
          { count: 2, formats: ['image'] as FastlaneFormat[] },
          organizationId,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(llmDispatcher.chatCompletion).not.toHaveBeenCalled();
    });

    it('returns an empty array when the LLM response is not valid JSON', async () => {
      delegate.findFirst.mockResolvedValue({
        agentConfig: { voice: { tone: 'bold' } },
        id: brandId,
        isDeleted: false,
        label: 'Acme',
        organizationId,
      });
      llmDispatcher.chatCompletion.mockResolvedValue({
        choices: [{ message: { content: 'not json at all' } }],
      });

      const result = await service.generateFastlaneIdeas(
        brandId,
        { count: 2, formats: ['image'] as FastlaneFormat[] },
        organizationId,
      );

      expect(result).toEqual([]);
    });
  });

  /**
   * Regression tests for the onboarding /brand-setup 500: Brand.slug is an
   * independent global-unique column, so reusing the org's slug without
   * checking it against the Brand table deterministically threw P2002.
   */
  describe('generateUniqueSlug', () => {
    it('returns the base slug when unused', async () => {
      delegate.findFirst.mockResolvedValue(null);

      const slug = await service.generateUniqueSlug('Genfeed.ai');

      expect(slug).toBe('genfeed-ai');
      expect(delegate.findFirst).toHaveBeenCalledTimes(1);
    });

    it('appends an incrementing counter on collision', async () => {
      delegate.findFirst
        .mockResolvedValueOnce({ id: 'brand_other' })
        .mockResolvedValueOnce({ id: 'brand_other' })
        .mockResolvedValueOnce(null);

      const slug = await service.generateUniqueSlug('Genfeed.ai');

      expect(slug).toBe('genfeed-ai-3');
      expect(delegate.findFirst).toHaveBeenCalledTimes(3);
    });

    it('does not self-collide when excludeBrandId matches the brand holding the slug', async () => {
      delegate.findFirst.mockImplementation(({ where }) => {
        if (where.id?.not === 'brand_1') {
          return Promise.resolve(null);
        }
        return Promise.resolve({ id: 'brand_1' });
      });

      const slug = await service.generateUniqueSlug('Genfeed.ai', 'brand_1');

      expect(slug).toBe('genfeed-ai');
      expect(delegate.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: { not: 'brand_1' },
          }),
        }),
      );
    });

    it('checks slug uniqueness against the Brand table independently of any organization slug', async () => {
      // Same label collides on Organization but the Brand table has it free —
      // generateUniqueSlug must only consult delegate.brand, never the org table.
      delegate.findFirst.mockResolvedValue(null);

      const slug = await service.generateUniqueSlug('Genfeed.ai');

      expect(slug).toBe('genfeed-ai');
      expect(delegate.findFirst).toHaveBeenCalledWith({
        where: { slug: 'genfeed-ai' },
      });
    });

    it('treats a soft-deleted brand slug as reserved by the global unique constraint', async () => {
      delegate.findFirst
        .mockResolvedValueOnce({ id: 'brand_deleted', isDeleted: true })
        .mockResolvedValueOnce(null);

      const slug = await service.generateUniqueSlug('Genfeed.ai');

      expect(slug).toBe('genfeed-ai-2');
      expect(delegate.findFirst).toHaveBeenNthCalledWith(1, {
        where: { slug: 'genfeed-ai' },
      });
    });

    it('throws BadRequestException when the generated slug is too short', async () => {
      await expect(service.generateUniqueSlug('!!')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('updateAgentConfig', () => {
    const brandId = 'brand-1';
    const orgId = 'org-1';

    /** The `agentConfig` JSON handed to `prisma.brand.update`. */
    function persistedConfig(): Record<string, unknown> {
      const call = delegate.update.mock.calls[0]?.[0] as {
        data: { agentConfig: Record<string, unknown> };
      };
      return call.data.agentConfig;
    }

    function withStoredConfig(agentConfig: Record<string, unknown>): void {
      delegate.findFirst.mockResolvedValue({ agentConfig, id: brandId });
      delegate.update.mockResolvedValue({ agentConfig, id: brandId });
    }

    it('leaves omitted top-level keys unchanged', async () => {
      withStoredConfig({ enabledSkills: ['research'], persona: 'Original' });

      await service.updateAgentConfig(brandId, orgId, {
        persona: 'Rewritten',
      });

      expect(persistedConfig()).toEqual({
        enabledSkills: ['research'],
        persona: 'Rewritten',
      });
    });

    it('never clears a key the caller explicitly sent as undefined', async () => {
      withStoredConfig({ enabledSkills: ['research'] });

      await service.updateAgentConfig(brandId, orgId, {
        enabledSkills: undefined,
        persona: 'Rewritten',
      });

      expect(persistedConfig().enabledSkills).toEqual(['research']);
    });

    it('clears a key the caller explicitly sent as null', async () => {
      withStoredConfig({ defaultVoiceId: 'voice-1' });

      await service.updateAgentConfig(brandId, orgId, {
        defaultVoiceId: null as unknown as string,
      });

      expect(persistedConfig().defaultVoiceId).toBeNull();
    });

    /**
     * `voice.taglines` and `voice.hashtags` are written by brand-kit extraction
     * and read back by `buildBrandContext`, but no UI surfaces them. A card that
     * patches one voice field must not take the rest of `voice` with it.
     */
    it('merges a partial voice patch instead of replacing the stored voice', async () => {
      withStoredConfig({
        voice: {
          hashtags: ['#build'],
          taglines: ['Ship it'],
          tone: 'formal',
        },
      });

      await service.updateAgentConfig(brandId, orgId, {
        voice: { tone: 'warm' },
      });

      expect(persistedConfig().voice).toEqual({
        hashtags: ['#build'],
        taglines: ['Ship it'],
        tone: 'warm',
      });
    });

    it('drops undefined keys materialised on a nested DTO instance', async () => {
      withStoredConfig({ voice: { taglines: ['Ship it'], tone: 'formal' } });

      // `plainToInstance` builds the DTO with `new`, so every declared-but-absent
      // property arrives as an own property holding `undefined`.
      await service.updateAgentConfig(brandId, orgId, {
        voice: { hashtags: undefined, taglines: undefined, tone: 'warm' },
      });

      expect(persistedConfig().voice).toEqual({
        taglines: ['Ship it'],
        tone: 'warm',
      });
    });

    it('replaces platformOverrides wholesale so cleared overrides stay cleared', async () => {
      withStoredConfig({
        platformOverrides: { twitter: { tone: 'punchy' }, youtube: {} },
      });

      await service.updateAgentConfig(brandId, orgId, {
        platformOverrides: { twitter: { tone: 'punchy' } },
      });

      expect(persistedConfig().platformOverrides).toEqual({
        twitter: { tone: 'punchy' },
      });
    });

    it('returns null without writing when the brand is outside the organization', async () => {
      delegate.findFirst.mockResolvedValue(null);

      await expect(
        service.updateAgentConfig(brandId, orgId, { persona: 'Rewritten' }),
      ).resolves.toBeNull();
      expect(delegate.update).not.toHaveBeenCalled();
    });
  });
});
