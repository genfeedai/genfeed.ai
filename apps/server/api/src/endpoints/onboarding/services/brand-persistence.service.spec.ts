import type { BrandsService } from '@api/collections/brands/services/brands.service';
import type { LinksService } from '@api/collections/links/services/links.service';
import type { MembersService } from '@api/collections/members/services/members.service';
import type { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import type { BrandSetupDto } from '@api/endpoints/onboarding/dto/brand-setup.dto';
import type { ReferenceImageDto } from '@api/endpoints/onboarding/dto/reference-images.dto';
import { LinkCategory } from '@genfeedai/enums';
import type { IExtractedBrandData } from '@genfeedai/interfaces';
import type { LoggerService } from '@libs/logger/logger.service';
import { HttpException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BrandDataMapper } from './brand-data.mapper';
import { BrandPersistenceService } from './brand-persistence.service';

describe('BrandPersistenceService', () => {
  let service: BrandPersistenceService;
  let brandsService: {
    findOne: ReturnType<typeof vi.fn>;
    generateUniqueSlug: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
    selectBrandForUser: ReturnType<typeof vi.fn>;
  };
  let linksService: {
    create: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
  };
  let membersService: { setLastUsedBrand: ReturnType<typeof vi.fn> };
  let organizationsService: {
    generateUniqueSlug: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
  };
  let loggerService: {
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    brandsService = {
      findOne: vi.fn(),
      generateUniqueSlug: vi.fn(),
      patch: vi.fn(),
      selectBrandForUser: vi.fn(),
    };
    linksService = {
      create: vi.fn(),
      findOne: vi.fn(),
      patch: vi.fn(),
    };
    membersService = {
      setLastUsedBrand: vi.fn(),
    };
    organizationsService = {
      generateUniqueSlug: vi.fn(),
      patch: vi.fn(),
    };
    loggerService = {
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    service = new BrandPersistenceService(
      loggerService as unknown as LoggerService,
      brandsService as unknown as BrandsService,
      linksService as unknown as LinksService,
      membersService as unknown as MembersService,
      organizationsService as unknown as OrganizationsService,
      new BrandDataMapper(),
    );
  });

  describe('resolveOnboardingBrand', () => {
    it('prefers the metadata brand when the id is a valid 24-hex id', async () => {
      const metadataBrand = { _id: 'a'.repeat(24) };
      brandsService.findOne.mockResolvedValueOnce(metadataBrand);

      const result = await service.resolveOnboardingBrand(
        'org_1',
        'user_1',
        'a'.repeat(24),
      );

      expect(result).toBe(metadataBrand);
      expect(brandsService.findOne).toHaveBeenCalledTimes(1);
    });

    it('falls back to the selected brand, then any brand for the user', async () => {
      const anyBrand = { _id: 'brand_any' };
      brandsService.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(anyBrand);

      const result = await service.resolveOnboardingBrand(
        'org_1',
        'user_1',
        'not-a-hex-id',
      );

      expect(result).toBe(anyBrand);
      expect(brandsService.findOne).toHaveBeenNthCalledWith(
        1,
        {
          isDeleted: false,
          isSelected: true,
          organization: 'org_1',
          user: 'user_1',
        },
        'none',
      );
    });
  });

  describe('resolveWritableOnboardingBrand', () => {
    it('returns the original brand when no label is provided', async () => {
      const brand = { _id: 'brand_1' };

      const result = await service.resolveWritableOnboardingBrand(
        brand,
        'org_1',
        'user_1',
        '  ',
      );

      expect(result).toBe(brand);
      expect(brandsService.findOne).not.toHaveBeenCalled();
    });

    it('switches to the label-matching brand and persists the selection', async () => {
      const brand = { _id: 'brand_1' };
      const matching = { _id: 'brand_2' };
      brandsService.findOne.mockResolvedValueOnce(matching);

      const result = await service.resolveWritableOnboardingBrand(
        brand,
        'org_1',
        'user_1',
        'Acme',
      );

      expect(result).toBe(matching);
      expect(brandsService.selectBrandForUser).toHaveBeenCalledWith(
        'brand_2',
        'user_1',
        'org_1',
      );
      expect(membersService.setLastUsedBrand).toHaveBeenCalledWith(
        {
          isActive: true,
          isDeleted: false,
          organization: 'org_1',
          user: 'user_1',
        },
        'brand_2',
      );
    });

    it('keeps the original brand when the match is the same brand', async () => {
      const brand = { _id: 'brand_1' };
      brandsService.findOne.mockResolvedValueOnce({ _id: 'brand_1' });

      const result = await service.resolveWritableOnboardingBrand(
        brand,
        'org_1',
        'user_1',
        'Acme',
      );

      expect(result).toBe(brand);
      expect(brandsService.selectBrandForUser).not.toHaveBeenCalled();
    });
  });

  describe('updateBrandWithScrapedData', () => {
    it('patches scraped fields and builds the system prompt', async () => {
      const scrapedData = {
        aboutText: 'About us',
        companyName: 'Acme',
        description: 'We make anvils',
        primaryColor: '#111',
        scrapedAt: new Date(),
        sourceUrl: 'https://acme.com',
        tagline: 'Anvils for all',
      };
      const dto = {
        brandUrl: 'https://acme.com',
        industry: 'Manufacturing',
        targetAudience: 'Coyotes',
      } as BrandSetupDto;

      await service.updateBrandWithScrapedData(
        'brand_1',
        scrapedData,
        dto,
        'Override',
      );

      expect(brandsService.patch).toHaveBeenCalledWith('brand_1', {
        description: 'We make anvils',
        label: 'Override',
        primaryColor: '#111',
        text: [
          'You are creating content for Acme.',
          'Brand tagline: "Anvils for all"',
          'About the brand: About us',
          'Industry: Manufacturing',
          'Target audience: Coyotes',
        ].join('\n\n'),
      });
    });

    it('skips the patch entirely when there is nothing to update', async () => {
      await service.updateBrandWithScrapedData(
        'brand_1',
        { scrapedAt: new Date(), sourceUrl: 'https://acme.com' },
        { brandUrl: 'https://acme.com' } as BrandSetupDto,
      );

      expect(brandsService.patch).not.toHaveBeenCalled();
    });
  });

  describe('upsertBrandWebsiteLink', () => {
    it('does nothing for a blank url', async () => {
      await service.upsertBrandWebsiteLink('brand_1', '   ');

      expect(linksService.findOne).not.toHaveBeenCalled();
    });

    it('patches the existing website link', async () => {
      linksService.findOne.mockResolvedValue({ id: 'link_1' });

      await service.upsertBrandWebsiteLink('brand_1', 'https://acme.com');

      expect(linksService.patch).toHaveBeenCalledWith('link_1', {
        label: 'Website',
        url: 'https://acme.com',
      });
      expect(linksService.create).not.toHaveBeenCalled();
    });

    it('creates a website link when none exists', async () => {
      linksService.findOne.mockResolvedValue(null);

      await service.upsertBrandWebsiteLink('brand_1', 'https://acme.com');

      expect(linksService.create).toHaveBeenCalledWith({
        brand: 'brand_1',
        category: LinkCategory.WEBSITE,
        label: 'Website',
        url: 'https://acme.com',
      });
    });
  });

  describe('updateBrandGuidance', () => {
    it('returns silently when the brand is missing', async () => {
      brandsService.findOne.mockResolvedValue(null);

      await service.updateBrandGuidance('brand_1', {
        scrapedAt: new Date(),
        sourceUrl: 'https://acme.com',
      } as IExtractedBrandData);

      expect(brandsService.patch).not.toHaveBeenCalled();
    });

    it('merges the extracted voice into the agent config patch', async () => {
      brandsService.findOne.mockResolvedValue({
        _id: 'brand_1',
        agentConfig: { persona: 'friendly' },
      });

      await service.updateBrandGuidance('brand_1', {
        brandVoice: {
          audience: 'founders',
          hashtags: [],
          taglines: [],
          tone: 'bold',
          values: [],
          voice: 'confident',
        },
        scrapedAt: new Date(),
        sourceUrl: 'https://acme.com',
      } as IExtractedBrandData);

      expect(brandsService.patch).toHaveBeenCalledWith('brand_1', {
        agentConfig: expect.objectContaining({
          persona: 'friendly',
          voice: expect.objectContaining({
            audience: ['founders'],
            style: 'confident',
            tone: 'bold',
          }),
        }),
      });
    });
  });

  describe('updateBrandGuidanceOverrides', () => {
    it('merges only provided overrides into the existing voice', async () => {
      brandsService.findOne.mockResolvedValue({
        _id: 'brand_1',
        agentConfig: { voice: { style: 'plain', tone: 'calm' } },
      });

      await service.updateBrandGuidanceOverrides('brand_1', {
        tone: 'bold',
      });

      expect(brandsService.patch).toHaveBeenCalledWith('brand_1', {
        agentConfig: {
          voice: { style: 'plain', tone: 'bold' },
        },
      });
    });
  });

  describe('syncOrgLabelAndSlug / syncBrandAndOrgSlug', () => {
    it('syncs the organization label and slug only', async () => {
      organizationsService.generateUniqueSlug.mockResolvedValue('acme');

      await service.syncOrgLabelAndSlug('Acme', 'org_1');

      expect(organizationsService.generateUniqueSlug).toHaveBeenCalledWith(
        'Acme',
        'org_1',
      );
      expect(organizationsService.patch).toHaveBeenCalledWith('org_1', {
        label: 'Acme',
        slug: 'acme',
      });
      expect(brandsService.patch).not.toHaveBeenCalled();
    });

    it('syncs org label/slug and the brand slug together', async () => {
      organizationsService.generateUniqueSlug.mockResolvedValue('acme');
      brandsService.generateUniqueSlug.mockResolvedValue('acme-brand');

      await service.syncBrandAndOrgSlug('Acme', 'org_1', 'brand_1');

      expect(organizationsService.patch).toHaveBeenCalledWith('org_1', {
        label: 'Acme',
        slug: 'acme',
      });
      expect(brandsService.generateUniqueSlug).toHaveBeenCalledWith(
        'Acme',
        'brand_1',
      );
      expect(brandsService.patch).toHaveBeenCalledWith('brand_1', {
        slug: 'acme-brand',
      });
    });
  });

  describe('addReferenceImages', () => {
    it('throws 404 when the brand does not belong to the organization', async () => {
      brandsService.findOne.mockResolvedValue(null);

      await expect(
        service.addReferenceImages('brand_1', [], 'org_1'),
      ).rejects.toThrow(HttpException);
    });

    it('appends new images to the existing reference images', async () => {
      brandsService.findOne.mockResolvedValue({
        _id: 'brand_1',
        referenceImages: [{ category: 'logo', url: 'https://old' }],
      });

      const result = await service.addReferenceImages(
        'brand_1',
        [
          {
            category: 'face',
            isDefault: true,
            label: 'Face',
            url: 'https://new',
          },
        ] as ReferenceImageDto[],
        'org_1',
      );

      expect(brandsService.patch).toHaveBeenCalledWith('brand_1', {
        referenceImages: [
          { category: 'logo', url: 'https://old' },
          {
            category: 'face',
            isDefault: true,
            label: 'Face',
            url: 'https://new',
          },
        ],
      });
      expect(result).toEqual({ count: 1, success: true });
    });
  });
});
