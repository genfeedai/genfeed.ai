import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';

vi.mock('@genfeedai/prisma', () => ({
  PrismaClient: class {},
  // Brand model has: id, mongoId, organizationId, userId, isDeleted, fontFamily (enum), scope (enum).
  // getModelMeta is used by BaseService to look up field/enum metadata.
  getModelMeta: () => ({
    allFields: [
      'id',
      'mongoId',
      'organizationId',
      'userId',
      'isDeleted',
      'fontFamily',
      'scope',
    ],
    enumFields: {
      fontFamily: { enumType: 'FontFamily', isRequired: true },
      scope: { enumType: 'AssetScope', isRequired: true },
    },
  }),
}));

import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CacheInvalidationService } from '@api/common/services/cache-invalidation.service';
import { BrandScraperService } from '@api/services/brand-scraper/brand-scraper.service';
import { CacheService } from '@api/services/cache/services/cache.service';
import { LlmDispatcherService } from '@api/services/integrations/llm/llm-dispatcher.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { FastlaneFormat } from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException } from '@nestjs/common';

describe('BrandsService', () => {
  let service: BrandsService;
  let delegate: Record<string, ReturnType<typeof vi.fn>>;
  let brandScraperService: {
    scrapeWebsite: ReturnType<typeof vi.fn>;
    validateUrl: ReturnType<typeof vi.fn>;
  };
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

    const prisma = {
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
      {
        invalidate: vi.fn(),
        invalidatePattern: vi.fn(),
      } as unknown as CacheInvalidationService,
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
});
