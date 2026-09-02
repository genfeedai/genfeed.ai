import { NotFoundException } from '@api/exceptions/not-found.exception';

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
import type { BrandOsPreviewService } from '@api/collections/brands/services/brand-os-preview.service';
import type { BrandRelocationService } from '@api/collections/brands/services/brand-relocation.service';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import type { DefaultRecurringContentService } from '@api/collections/brands/services/default-recurring-content.service';
import type { SkillsService } from '@api/collections/skills/services/skills.service';
import {
  CACHE_PATTERNS,
  CACHE_TAGS,
  SCOPED_CACHE_TAGS,
} from '@api/common/constants/cache-patterns.constants';
import type { AccessBootstrapCacheService } from '@api/common/services/access-bootstrap-cache.service';
import { CacheInvalidationService } from '@api/common/services/cache-invalidation.service';
import { BrandScraperService } from '@api/services/brand-scraper/brand-scraper.service';
import { CacheService } from '@api/services/cache/cache.service';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { LlmDispatcherService } from '@api/services/integrations/llm/llm-dispatcher.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ReferenceImageCategory } from '@genfeedai/contracts';
import type { FastlaneFormat } from '@genfeedai/contracts/interfaces';
import { Prisma } from '@genfeedai/prisma';
import { testId } from '@helpers/testing/test-id.helper';
import type { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, ConflictException } from '@nestjs/common';

describe('BrandsService', () => {
  let service: BrandsService;
  let delegate: Record<string, ReturnType<typeof vi.fn>>;
  let assetDelegate: Record<string, ReturnType<typeof vi.fn>>;
  let queryRaw: ReturnType<typeof vi.fn>;
  let brandScraperService: {
    scrapeWebsite: ReturnType<typeof vi.fn>;
    validateUrl: ReturnType<typeof vi.fn>;
  };
  let brandOsPreviewService: {
    claimPreview: ReturnType<typeof vi.fn>;
    readClaimedPreview: ReturnType<typeof vi.fn>;
  };
  let cacheInvalidationService: {
    invalidate: ReturnType<typeof vi.fn>;
    invalidateByTags: ReturnType<typeof vi.fn>;
  };
  let accessBootstrapCacheService: {
    invalidateForOrganization: ReturnType<typeof vi.fn>;
  };
  let filesClientService: { uploadToS3: ReturnType<typeof vi.fn> };
  let llmDispatcher: { chatCompletion: ReturnType<typeof vi.fn> };
  let loggerService: LoggerService;
  let defaultRecurringContentService: {
    updateScheduleFromAgentConfig: ReturnType<typeof vi.fn>;
  };
  let skillsService: {
    assertAccessibleSkillSlugs: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    brandScraperService = {
      scrapeWebsite: vi.fn(),
      validateUrl: vi.fn(),
    };
    brandOsPreviewService = {
      claimPreview: vi.fn(),
      readClaimedPreview: vi.fn(),
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
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn(),
      updateMany: vi.fn(),
    };
    cacheInvalidationService = {
      invalidate: vi.fn(),
      invalidateByTags: vi.fn(),
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
    defaultRecurringContentService = {
      updateScheduleFromAgentConfig: vi.fn().mockResolvedValue(undefined),
    };
    skillsService = {
      assertAccessibleSkillSlugs: vi.fn().mockResolvedValue(undefined),
    };

    queryRaw = vi.fn().mockResolvedValue([]);
    const prisma = {
      // Brand kit asset relations resolve through a single ranked raw query.
      $queryRaw: queryRaw,
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
      brandOsPreviewService as unknown as BrandOsPreviewService,
      defaultRecurringContentService as unknown as DefaultRecurringContentService,
      skillsService as unknown as SkillsService,
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

    it('writes canonical ownership fields', async () => {
      delegate.create.mockResolvedValue({
        ...createBrandDto,
        id: 'brand-1',
        organizationId: 'org-1',
        userId: 'user-1',
      });

      await service.create({
        ...createBrandDto,
        organizationId: 'org-1',
        userId: 'user-1',
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
      expect(cacheInvalidationService.invalidateByTags).toHaveBeenCalledWith([
        CACHE_TAGS.BRANDS,
      ]);
      expect(
        accessBootstrapCacheService.invalidateForOrganization,
      ).toHaveBeenCalledWith('org-1');
    });

    it('validates enabled skills before atomically creating initial agent config', async () => {
      delegate.create.mockResolvedValue({
        ...createBrandDto,
        id: 'brand-1',
        organizationId: 'org-1',
      });

      await service.create({
        ...createBrandDto,
        agentConfig: { enabledSkills: ['content-writing'] },
        organizationId: 'org-1',
      });

      expect(skillsService.assertAccessibleSkillSlugs).toHaveBeenCalledWith(
        'org-1',
        ['content-writing'],
      );
      expect(delegate.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            agentConfig: { enabledSkills: ['content-writing'] },
          }),
        }),
      );
    });

    it('rejects creation without organization context before writing', async () => {
      await expect(
        service.create(createBrandDto as never),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(delegate.create).not.toHaveBeenCalled();
    });
  });

  describe('findForOrganization', () => {
    // The access bootstrap serves the agent setup panel straight from these
    // rows, so the brand kit assets have to ride along or the setup checklist
    // reports a logo-less brand for a brand that has one.
    it('attaches the resolved logo, banner and references to every brand', async () => {
      delegate.findMany.mockResolvedValue([
        { id: 'brand-1', organizationId: 'org-1' },
        { id: 'brand-2', organizationId: 'org-1' },
      ]);
      queryRaw.mockResolvedValue([
        {
          category: 'LOGO',
          cloudObjectKey: 'logos/logo-1',
          displayName: 'Wordmark',
          id: 'logo-1',
          mimeType: 'image/png',
          parentBrandId: 'brand-1',
        },
        {
          category: 'REFERENCE',
          cloudObjectKey: 'references/ref-1',
          displayName: null,
          id: 'ref-1',
          mimeType: null,
          parentBrandId: 'brand-1',
        },
      ]);

      const brands = await service.findForOrganization('org-1');

      expect(queryRaw).toHaveBeenCalledTimes(1);
      expect(brands[0].logo).toEqual({
        category: 'LOGO',
        cdnUrl: 'https://cdn.example.com/logos/logo-1',
        displayName: 'Wordmark',
        id: 'logo-1',
        mimeType: 'image/png',
      });
      expect(brands[0].references).toHaveLength(1);
      expect(brands[1].logo).toBeUndefined();
      expect(brands[1].references).toEqual([]);
    });

    it('scopes the asset reads to the requested organization and brand', async () => {
      delegate.findMany.mockResolvedValue([
        { id: 'brand-1', organizationId: 'org-1' },
      ]);

      await service.findForOrganization('org-1');

      expect(queryRaw).toHaveBeenCalledTimes(1);
      expect(queryRaw.mock.calls[0]?.slice(1)).toEqual([
        'org-1',
        ['brand-1'],
        ['LOGO', 'BANNER', 'REFERENCE'],
        'REFERENCE',
        10,
      ]);
    });

    it('skips the asset read when the organization has no brands', async () => {
      delegate.findMany.mockResolvedValue([]);

      await expect(service.findForOrganization('org-1')).resolves.toEqual([]);
      expect(queryRaw).not.toHaveBeenCalled();
    });
  });

  describe('patch', () => {
    it('writes only mutable brand fields', async () => {
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
        label: 'Renamed',
      });

      expect(result.label).toBe('Renamed');
      const updateCall = delegate.update.mock.calls.at(-1)?.[0] as
        | { data: Record<string, unknown> }
        | undefined;
      expect(updateCall?.data).toMatchObject({ label: 'Renamed' });
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
      });

      const updateCall = delegate.update.mock.calls.at(-1)?.[0] as
        | { data: Record<string, unknown> }
        | undefined;
      expect(updateCall?.data).toEqual({ label: 'Renamed' });
      expect(updateCall?.data).not.toHaveProperty('description');
      expect(updateCall?.data).not.toHaveProperty('primaryColor');
    });

    it('rejects agentConfig so JSON updates cannot bypass the merge boundary', async () => {
      await expect(
        service.patch('brand-1', {
          agentConfig: { persona: 'Replacement' },
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(delegate.update).not.toHaveBeenCalled();
    });
  });

  describe('updateIdentityForOrganization', () => {
    it('updates exactly one active brand within the organization scope', async () => {
      const updated = {
        description: 'Updated description',
        id: 'brand-1',
        isDeleted: false,
        label: 'Updated Brand',
        organizationId: 'org-1',
        slug: 'updated-brand',
      };
      delegate.updateMany.mockResolvedValue({ count: 1 });
      delegate.findFirst.mockResolvedValue(updated);

      await expect(
        service.updateIdentityForOrganization('brand-1', 'org-1', {
          description: 'Updated description',
          label: 'Updated Brand',
          slug: 'updated-brand',
        }),
      ).resolves.toEqual(updated);

      expect(delegate.updateMany).toHaveBeenCalledWith({
        data: {
          description: 'Updated description',
          label: 'Updated Brand',
          slug: 'updated-brand',
        },
        where: {
          id: 'brand-1',
          isDeleted: false,
          organizationId: 'org-1',
        },
      });
    });

    it('fails closed when the scoped atomic update matches no active brand', async () => {
      delegate.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.updateIdentityForOrganization('foreign-brand', 'org-1', {
          description: 'Updated description',
          label: 'Updated Brand',
          slug: 'updated-brand',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(delegate.findFirst).not.toHaveBeenCalled();
    });
  });

  it('finds a create retry by active organization, user, and confirmation provenance', async () => {
    const recovered = {
      id: 'brand-recovered',
      organizationId: 'org-1',
      userId: 'user-1',
    };
    delegate.findFirst.mockResolvedValue(recovered);

    await expect(
      service.findCreateByIdentityConfirmationSource(
        'org-1',
        'user-1',
        'brand-identity-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      ),
    ).resolves.toEqual(recovered);
    expect(delegate.findFirst).toHaveBeenCalledWith({
      where: {
        agentConfig: {
          equals: 'brand-identity-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          path: ['brandIdentityConfirmation', 'createSourceActionId'],
        },
        isDeleted: false,
        organizationId: 'org-1',
        userId: 'user-1',
      },
    });
  });

  it('selects a brand using its canonical id', async () => {
    const currentBrandId = testId('brand');
    const organizationId = testId('org');
    const userId = 'user_current';

    delegate.findFirst
      .mockResolvedValueOnce({
        id: currentBrandId,
        isDeleted: false,
        organizationId,
        userId,
      })
      .mockResolvedValueOnce({
        id: currentBrandId,
        isDeleted: false,
        isSelected: true,
        organizationId,
        userId,
      });
    delegate.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.selectBrandForUser(
      currentBrandId,
      userId,
      organizationId,
    );

    expect(delegate.findFirst).toHaveBeenNthCalledWith(1, {
      where: {
        id: currentBrandId,
        isDeleted: false,
        organizationId,
      },
    });
    expect(delegate.updateMany).toHaveBeenNthCalledWith(2, {
      data: { isSelected: true },
      where: { id: currentBrandId, isDeleted: false, organizationId },
    });
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
        SCOPED_CACHE_TAGS.BRAND_CONTEXT(organizationId),
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

    it('persists an explicit category when a reference was already imported', async () => {
      assetDelegate.findFirst.mockResolvedValueOnce({
        id: 'asset_existing',
        referenceCategory: null,
      });

      const result = await service.importBrandKitAssets(
        brandId,
        organizationId,
        userId,
        {
          assets: [
            {
              mimeType: 'image/png',
              referenceCategory: ReferenceImageCategory.FACE,
              role: 'reference',
              url: 'https://acme.example/character.png',
            },
          ],
        },
      );

      expect(assetDelegate.updateMany).toHaveBeenCalledWith({
        data: { referenceCategory: 'FACE' },
        where: {
          id: 'asset_existing',
          isDeleted: false,
          parentBrandId: brandId,
          parentOrgId: organizationId,
        },
      });
      expect(result.results[0]).toMatchObject({
        assetId: 'asset_existing',
        referenceCategory: 'FACE',
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
              referenceCategory: ReferenceImageCategory.PRODUCT,
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
      expect(assetDelegate.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ referenceCategory: 'PRODUCT' }),
      });
      expect(result.results[0]).toMatchObject({
        referenceCategory: 'PRODUCT',
      });
      expect(result.status).toBe('accepted');
    });

    it('defaults uncategorized legacy reference imports to STYLE', async () => {
      assetDelegate.findFirst.mockResolvedValueOnce(null);

      const result = await service.importBrandKitAssets(
        brandId,
        organizationId,
        userId,
        {
          assets: [
            {
              mimeType: 'image/webp',
              role: 'reference',
              url: 'https://acme.example/reference.webp',
            },
          ],
        },
      );

      expect(assetDelegate.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ referenceCategory: 'STYLE' }),
      });
      expect(result.results[0]).toMatchObject({ referenceCategory: 'STYLE' });
    });

    it('rejects reference categories on logo and banner assets', async () => {
      const result = await service.importBrandKitAssets(
        brandId,
        organizationId,
        userId,
        {
          assets: [
            {
              mimeType: 'image/png',
              referenceCategory: ReferenceImageCategory.PRODUCT,
              role: 'logo',
              url: 'https://acme.example/logo.png',
            },
          ],
        },
      );

      expect(assetDelegate.create).not.toHaveBeenCalled();
      expect(result.results[0]).toMatchObject({
        diagnostics: [
          expect.objectContaining({
            code: 'brand_kit_asset_reference_category_requires_reference_role',
          }),
        ],
        status: 'failed',
      });
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

  describe('Brand OS preview handoff', () => {
    const organizationId = 'org_1';
    const brandId = 'brand_1';
    const brand = {
      id: brandId,
      isDeleted: false,
      organizationId,
    };
    const handoff = {
      draft: {
        assetCandidates: [],
        brandId,
        diagnostics: [],
        evidence: [],
        fields: {},
        id: brandId,
        organizationId,
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
    } as const;

    it('claims only after a strict active tenant-brand lookup', async () => {
      delegate.findFirst.mockResolvedValue(brand);
      brandOsPreviewService.claimPreview.mockResolvedValue(handoff);

      await expect(
        service.claimBrandOsPreview(brandId, organizationId, 'a'.repeat(43)),
      ).resolves.toBe(handoff);

      expect(delegate.findFirst).toHaveBeenCalledWith({
        where: { id: brandId, isDeleted: false, organizationId },
      });
      expect(brandOsPreviewService.claimPreview).toHaveBeenCalledWith(
        'a'.repeat(43),
        organizationId,
        brand,
      );
      expect(delegate.create).not.toHaveBeenCalled();
      expect(delegate.updateMany).not.toHaveBeenCalled();
    });

    it('reads only the current tenant-bound claimed draft', async () => {
      delegate.findFirst.mockResolvedValue(brand);
      brandOsPreviewService.readClaimedPreview.mockResolvedValue(handoff);

      await expect(
        service.readClaimedBrandOsPreview(brandId, organizationId),
      ).resolves.toBe(handoff);

      expect(delegate.findFirst).toHaveBeenCalledWith({
        where: { id: brandId, isDeleted: false, organizationId },
      });
      expect(brandOsPreviewService.readClaimedPreview).toHaveBeenCalledWith(
        organizationId,
        brand,
      );
    });

    it('does not consume or read a preview when the tenant brand is absent', async () => {
      delegate.findFirst.mockResolvedValue(null);

      await expect(
        service.claimBrandOsPreview(brandId, organizationId, 'a'.repeat(43)),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        service.readClaimedBrandOsPreview(brandId, organizationId),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(brandOsPreviewService.claimPreview).not.toHaveBeenCalled();
      expect(brandOsPreviewService.readClaimedPreview).not.toHaveBeenCalled();
    });
  });

  describe('applyBrandKitDraft', () => {
    const organizationId = 'org_1';
    const brandId = 'brand_1';

    it('applies scalar fields through one active organization-scoped write without a JSON predicate', async () => {
      delegate.findFirst.mockResolvedValueOnce({
        agentConfig: { persona: 'Existing' },
        id: brandId,
        isDeleted: false,
        organizationId,
      });
      delegate.updateMany.mockResolvedValue({ count: 1 });
      delegate.findFirst.mockResolvedValueOnce({
        agentConfig: { persona: 'Existing' },
        description: 'Imported description',
        id: brandId,
        isDeleted: false,
        organizationId,
      });

      const result = await service.applyBrandKitDraft(brandId, organizationId, {
        fields: {
          description: {
            action: 'accept',
            value: 'Imported description',
          },
        },
      });

      expect(delegate.update).not.toHaveBeenCalled();
      expect(delegate.updateMany).toHaveBeenCalledWith({
        data: { description: 'Imported description' },
        where: { id: brandId, isDeleted: false, organizationId },
      });
      expect(delegate.findFirst).toHaveBeenLastCalledWith({
        where: { id: brandId, isDeleted: false, organizationId },
      });
      expect(cacheInvalidationService.invalidate).toHaveBeenCalledWith(
        CACHE_PATTERNS.BRANDS_SINGLE(brandId),
      );
      expect(cacheInvalidationService.invalidateByTags).toHaveBeenCalledWith([
        CACHE_TAGS.BRANDS,
        SCOPED_CACHE_TAGS.BRAND_CONTEXT(organizationId),
      ]);
      expect(
        accessBootstrapCacheService.invalidateForOrganization,
      ).toHaveBeenCalledWith(organizationId);
      expect(result).toEqual({
        appliedFields: ['description'],
        brandId,
        diagnostics: [],
        id: brandId,
        preservedFields: [],
        status: 'accepted',
      });
    });

    it('atomically applies scalar, voice, and strategy fields against the initial agent-config snapshot', async () => {
      const initialAgentConfig = {
        strategy: { frequency: 'weekly' },
        voice: { style: 'direct' },
      };
      delegate.findFirst.mockResolvedValueOnce({
        agentConfig: initialAgentConfig,
        id: brandId,
        isDeleted: false,
        organizationId,
      });
      delegate.updateMany.mockResolvedValue({ count: 1 });
      delegate.findFirst.mockResolvedValueOnce({
        agentConfig: {
          strategy: {
            frequency: 'weekly',
            platforms: ['linkedin', 'youtube'],
          },
          voice: { style: 'direct', tone: 'Confident' },
        },
        description: 'Imported description',
        id: brandId,
        isDeleted: false,
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
      expect(delegate.update).not.toHaveBeenCalled();
      expect(delegate.updateMany).toHaveBeenCalledWith({
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
        where: {
          agentConfig: { equals: initialAgentConfig },
          id: brandId,
          isDeleted: false,
          organizationId,
        },
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

    it('matches a never-set agentConfig with AnyNull on the Brand Kit CAS write', async () => {
      delegate.findFirst.mockResolvedValueOnce({
        agentConfig: null,
        id: brandId,
        isDeleted: false,
        organizationId,
      });
      delegate.updateMany.mockResolvedValue({ count: 1 });
      delegate.findFirst.mockResolvedValueOnce({
        agentConfig: {
          voice: { tone: 'Confident' },
        },
        id: brandId,
        isDeleted: false,
        organizationId,
      });

      await service.applyBrandKitDraft(brandId, organizationId, {
        fields: {
          voiceTone: {
            action: 'accept',
            value: 'Confident',
          },
        },
      });

      expect(delegate.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            agentConfig: { equals: Prisma.AnyNull },
            id: brandId,
            organizationId,
          }),
        }),
      );
    });

    it.each(['relocated', 'soft-deleted'])(
      'does not reread or invalidate when the brand is %s after the scoped read',
      async () => {
        delegate.findFirst.mockResolvedValueOnce({
          agentConfig: {},
          id: brandId,
          isDeleted: false,
          organizationId,
        });
        delegate.updateMany.mockResolvedValue({ count: 0 });

        await expect(
          service.applyBrandKitDraft(brandId, organizationId, {
            fields: {
              description: {
                action: 'accept',
                value: 'Imported description',
              },
            },
          }),
        ).rejects.toBeInstanceOf(NotFoundException);

        expect(delegate.findFirst).toHaveBeenCalledTimes(1);
        expect(cacheInvalidationService.invalidate).not.toHaveBeenCalled();
        expect(
          cacheInvalidationService.invalidateByTags,
        ).not.toHaveBeenCalled();
        expect(
          accessBootstrapCacheService.invalidateForOrganization,
        ).not.toHaveBeenCalled();
      },
    );

    it('returns a conflict without overwriting a concurrent unrelated agent-config field', async () => {
      const initialAgentConfig = { voice: { tone: 'formal' } };
      let persistedAgentConfig: Record<string, unknown> = {
        enabledSkills: ['research'],
        voice: { tone: 'formal' },
      };
      delegate.findFirst.mockResolvedValueOnce({
        agentConfig: initialAgentConfig,
        id: brandId,
        isDeleted: false,
        organizationId,
      });
      delegate.updateMany.mockImplementation(async (args: unknown) => {
        const update = args as {
          data: { agentConfig: Record<string, unknown> };
          where: { agentConfig?: { equals?: unknown } };
        };

        if (
          JSON.stringify(update.where.agentConfig?.equals) !==
          JSON.stringify(persistedAgentConfig)
        ) {
          return { count: 0 };
        }

        persistedAgentConfig = update.data.agentConfig;
        return { count: 1 };
      });

      await expect(
        service.applyBrandKitDraft(brandId, organizationId, {
          fields: {
            voiceStyle: {
              action: 'accept',
              value: 'direct',
            },
          },
        }),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(delegate.update).not.toHaveBeenCalled();
      expect(delegate.updateMany).toHaveBeenCalledWith({
        data: {
          agentConfig: {
            voice: { style: 'direct', tone: 'formal' },
          },
        },
        where: {
          agentConfig: { equals: initialAgentConfig },
          id: brandId,
          isDeleted: false,
          organizationId,
        },
      });
      expect(persistedAgentConfig).toEqual({
        enabledSkills: ['research'],
        voice: { tone: 'formal' },
      });
      expect(delegate.findFirst).toHaveBeenCalledTimes(1);
      expect(cacheInvalidationService.invalidate).not.toHaveBeenCalled();
      expect(cacheInvalidationService.invalidateByTags).not.toHaveBeenCalled();
      expect(
        accessBootstrapCacheService.invalidateForOrganization,
      ).not.toHaveBeenCalled();
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
      expect(delegate.updateMany).not.toHaveBeenCalled();
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
      expect(delegate.updateMany).not.toHaveBeenCalled();
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

    /** The `agentConfig` JSON handed to `prisma.brand.updateMany`. */
    function persistedConfig(): Record<string, unknown> {
      const call = delegate.updateMany.mock.calls[0]?.[0] as {
        data: { agentConfig: Record<string, unknown> };
      };
      return call.data.agentConfig;
    }

    function withStoredConfig(agentConfig: Record<string, unknown>): void {
      delegate.findFirst.mockResolvedValue({
        agentConfig,
        id: brandId,
        updatedAt: new Date('2026-08-21T00:00:00.000Z'),
      });
      delegate.updateMany.mockResolvedValue({ count: 1 });
    }

    it('validates enabled skill slugs at the persistence boundary', async () => {
      withStoredConfig({ enabledSkills: [] });

      await service.updateAgentConfig(brandId, orgId, {
        enabledSkills: ['content-writing'],
      });

      expect(skillsService.assertAccessibleSkillSlugs).toHaveBeenCalledWith(
        orgId,
        ['content-writing'],
      );
    });

    it('does not write when enabled skill validation fails', async () => {
      skillsService.assertAccessibleSkillSlugs.mockRejectedValue(
        new BadRequestException('Unknown skill'),
      );

      await expect(
        service.updateAgentConfig(brandId, orgId, {
          enabledSkills: ['unknown-skill'],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(delegate.findFirst).not.toHaveBeenCalled();
      expect(delegate.updateMany).not.toHaveBeenCalled();
    });

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
        platformOverrides: {
          twitter: { voice: { tone: 'punchy' } },
          youtube: {},
        },
      });

      await service.updateAgentConfig(brandId, orgId, {
        platformOverrides: { twitter: { voice: { tone: 'punchy' } } },
      });

      expect(persistedConfig().platformOverrides).toEqual({
        twitter: { voice: { tone: 'punchy' } },
      });
    });

    it('returns null without writing when the brand is outside the organization', async () => {
      delegate.findFirst.mockResolvedValue(null);

      await expect(
        service.updateAgentConfig(brandId, orgId, { persona: 'Rewritten' }),
      ).resolves.toBeNull();
      expect(delegate.updateMany).not.toHaveBeenCalled();
    });

    /**
     * The read and the write are separate statements. `update({ where: { id } })`
     * writes unconditionally once the read resolved, so the tenant predicate has
     * to sit inside the mutating statement itself.
     */
    it('matches a never-set agentConfig with AnyNull so DB NULL and JSON null both CAS', async () => {
      delegate.findFirst.mockResolvedValue({
        agentConfig: null,
        id: brandId,
        updatedAt: new Date('2026-08-21T00:00:00.000Z'),
      });
      delegate.updateMany.mockResolvedValue({ count: 1 });

      await service.updateAgentConfig(brandId, orgId, {
        persona: 'First',
      });

      expect(delegate.updateMany).toHaveBeenCalledWith({
        data: { agentConfig: { persona: 'First' } },
        where: {
          agentConfig: { equals: Prisma.AnyNull },
          id: brandId,
          isDeleted: false,
          organizationId: orgId,
        },
      });
    });

    it('carries the organization predicate on the write, not only on the lookup', async () => {
      withStoredConfig({ persona: 'Original' });

      await service.updateAgentConfig(brandId, orgId, {
        persona: 'Rewritten',
      });

      expect(delegate.update).not.toHaveBeenCalled();
      expect(delegate.updateMany).toHaveBeenCalledWith({
        data: { agentConfig: { persona: 'Rewritten' } },
        where: {
          agentConfig: { equals: { persona: 'Original' } },
          id: brandId,
          isDeleted: false,
          organizationId: orgId,
        },
      });
    });

    it('re-reads and re-merges after a concurrent agent config update', async () => {
      delegate.findFirst
        .mockResolvedValueOnce({
          agentConfig: { voice: { tone: 'formal' } },
          id: brandId,
          updatedAt: new Date('2026-08-21T00:00:00.000Z'),
        })
        .mockResolvedValueOnce({
          agentConfig: {
            enabledSkills: ['content-writing'],
            voice: { tone: 'formal' },
          },
          id: brandId,
          updatedAt: new Date('2026-08-21T00:00:01.000Z'),
        })
        .mockResolvedValue({
          agentConfig: {
            enabledSkills: ['content-writing'],
            voice: { style: 'direct', tone: 'formal' },
          },
          id: brandId,
        });
      delegate.updateMany
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 1 });

      await service.updateAgentConfig(brandId, orgId, {
        voice: { style: 'direct' },
      });

      expect(delegate.updateMany).toHaveBeenLastCalledWith({
        data: {
          agentConfig: {
            enabledSkills: ['content-writing'],
            voice: { style: 'direct', tone: 'formal' },
          },
        },
        where: {
          agentConfig: {
            equals: {
              enabledSkills: ['content-writing'],
              voice: { tone: 'formal' },
            },
          },
          id: brandId,
          isDeleted: false,
          organizationId: orgId,
        },
      });
    });

    it('returns null when the scoped write matches no row in the organization', async () => {
      // A brand that resolved at read time but is gone — or was never this
      // org's — at write time must not fall through to a re-read of someone
      // else's row.
      delegate.findFirst.mockResolvedValue({
        agentConfig: { persona: 'Original' },
        id: brandId,
      });
      delegate.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.updateAgentConfig(brandId, orgId, { persona: 'Rewritten' }),
      ).resolves.toBeNull();
      expect(
        defaultRecurringContentService.updateScheduleFromAgentConfig,
      ).not.toHaveBeenCalled();
      expect(cacheInvalidationService.invalidate).not.toHaveBeenCalled();
    });

    /**
     * `updateMany` bypasses `BaseService.patch()`, so this write is the only
     * thing that can bust its own caches. `agentConfig` is embedded in the
     * assembled agent brand context, which is why the org-scoped tag is busted
     * alongside the single-brand key.
     */
    it('busts the brand and agent-context caches after the scoped write', async () => {
      withStoredConfig({ persona: 'Original' });

      await service.updateAgentConfig(brandId, orgId, {
        persona: 'Rewritten',
      });

      expect(cacheInvalidationService.invalidate).toHaveBeenCalledWith(
        CACHE_PATTERNS.BRANDS_SINGLE(brandId),
      );
      expect(cacheInvalidationService.invalidateByTags).toHaveBeenCalledWith([
        CACHE_TAGS.BRANDS,
        SCOPED_CACHE_TAGS.BRAND_CONTEXT(orgId),
      ]);
      expect(
        accessBootstrapCacheService.invalidateForOrganization,
      ).toHaveBeenCalledWith(orgId);
    });

    it('propagates publishing schedule changes to default recurring workflows', async () => {
      withStoredConfig({
        schedule: {
          cronExpression: '0 8 * * *',
          enabled: true,
          timezone: 'UTC',
        },
      });

      await service.updateAgentConfig(brandId, orgId, {
        schedule: {
          cronExpression: '0 12 * * *',
          enabled: false,
          timezone: 'Europe/Malta',
        },
      });

      // The config is already committed by the time the scheduler is called, so
      // a scheduler outage takes the degraded path instead of surfacing as a
      // failed save on an update that in fact persisted.
      expect(
        defaultRecurringContentService.updateScheduleFromAgentConfig,
      ).toHaveBeenCalledWith(
        orgId,
        brandId,
        {
          schedule: {
            cronExpression: '0 12 * * *',
            enabled: false,
            timezone: 'Europe/Malta',
          },
        },
        { isSchedulerRequired: false },
      );
    });

    it('rejects an invalid cron expression with an actionable BadRequestException', async () => {
      withStoredConfig({ schedule: { timezone: 'UTC' } });
      const update = service.updateAgentConfig(brandId, orgId, {
        schedule: { cronExpression: 'not-a-cron' },
      });

      await expect(update).rejects.toThrow(BadRequestException);
      await expect(update).rejects.toThrow('Invalid cron expression');
      expect(delegate.updateMany).not.toHaveBeenCalled();
      expect(
        defaultRecurringContentService.updateScheduleFromAgentConfig,
      ).not.toHaveBeenCalled();
    });

    it('rejects a partial update that carries forward a stored invalid cron', async () => {
      withStoredConfig({
        schedule: {
          cronExpression: 'not-a-cron',
          enabled: true,
          timezone: 'UTC',
        },
      });

      const update = service.updateAgentConfig(brandId, orgId, {
        schedule: { timezone: 'Europe/Malta' },
      });

      await expect(update).rejects.toThrow(BadRequestException);
      expect(delegate.updateMany).not.toHaveBeenCalled();
      expect(
        defaultRecurringContentService.updateScheduleFromAgentConfig,
      ).not.toHaveBeenCalled();
    });

    /**
     * The timezone is half of the schedule. Validating the cron against a
     * hardcoded 'UTC' accepted an unknown IANA zone here and let it explode
     * later inside the scheduler.
     */
    it('rejects an unknown timezone before persisting the schedule', async () => {
      withStoredConfig({
        schedule: { cronExpression: '0 8 * * *', timezone: 'UTC' },
      });

      const update = service.updateAgentConfig(brandId, orgId, {
        schedule: { timezone: 'Mars/Olympus_Mons' },
      });

      await expect(update).rejects.toThrow(BadRequestException);
      await expect(update).rejects.toThrow('Invalid timezone');
      expect(delegate.updateMany).not.toHaveBeenCalled();
      expect(
        defaultRecurringContentService.updateScheduleFromAgentConfig,
      ).not.toHaveBeenCalled();
    });

    it('accepts a valid IANA timezone paired with a cron valid in that zone', async () => {
      withStoredConfig({ schedule: { cronExpression: '0 8 * * *' } });

      await service.updateAgentConfig(brandId, orgId, {
        schedule: { timezone: 'Australia/Eucla' },
      });

      expect(delegate.updateMany).toHaveBeenCalledWith({
        data: {
          agentConfig: {
            schedule: {
              cronExpression: '0 8 * * *',
              timezone: 'Australia/Eucla',
            },
          },
        },
        where: {
          agentConfig: {
            equals: { schedule: { cronExpression: '0 8 * * *' } },
          },
          id: brandId,
          isDeleted: false,
          organizationId: orgId,
        },
      });
    });
  });
});
