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

import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CacheInvalidationService } from '@api/common/services/cache-invalidation.service';
import { BrandScraperService } from '@api/services/brand-scraper/brand-scraper.service';
import { CacheService } from '@api/services/cache/services/cache.service';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { LlmDispatcherService } from '@api/services/integrations/llm/llm-dispatcher.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { FastlaneFormat } from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException } from '@nestjs/common';

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
  let filesClientService: { uploadToS3: ReturnType<typeof vi.fn> };
  let llmDispatcher: { chatCompletion: ReturnType<typeof vi.fn> };

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
    filesClientService = {
      uploadToS3: vi.fn(),
    };

    const prisma = {
      asset: assetDelegate,
      brand: delegate,
    } as unknown as PrismaService;

    service = new BrandsService(
      prisma,
      {
        debug: vi.fn(),
        error: vi.fn(),
        log: vi.fn(),
        warn: vi.fn(),
      } as unknown as LoggerService,
      { invalidateByTags: vi.fn() } as unknown as CacheService,
      brandScraperService as unknown as BrandScraperService,
      llmDispatcher as unknown as LlmDispatcherService,
      cacheInvalidationService as unknown as CacheInvalidationService,
      filesClientService as unknown as FilesClientService,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
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
    expect(result).toMatchObject({
      _id: legacyBrandId,
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
        where: { isDeleted: false, slug: 'genfeed-ai' },
      });
    });

    it('throws BadRequestException when the generated slug is too short', async () => {
      await expect(service.generateUniqueSlug('!!')).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
