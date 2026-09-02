import { BrandWebsitePreviewService } from '@api/collections/brands/services/brand-website-preview.service';
import type { BrandScraperService } from '@api/services/brand-scraper/brand-scraper.service';
import type { IScrapedBrandData } from '@genfeedai/contracts/interfaces';
import { BadRequestException, HttpStatus } from '@nestjs/common';

describe('BrandWebsitePreviewService', () => {
  const sourceUrl = 'https://acme.com';
  const scrapedAt = new Date('2026-08-11T00:00:00.000Z');

  let brandScraperService: { scrapeWebsite: ReturnType<typeof vi.fn> };
  let service: BrandWebsitePreviewService;

  function scrapedData(
    overrides: Partial<IScrapedBrandData> = {},
  ): IScrapedBrandData {
    return {
      scrapedAt,
      sourceUrl,
      ...overrides,
    };
  }

  beforeEach(() => {
    brandScraperService = { scrapeWebsite: vi.fn() };
    service = new BrandWebsitePreviewService(
      brandScraperService as unknown as BrandScraperService,
    );
  });

  it.each([
    [
      'company name',
      { companyName: '  Acme & Co.  ', heroText: 'Hero', tagline: 'Tagline' },
      'Acme & Co.',
      'acme-co',
    ],
    [
      'tagline',
      { companyName: '  ', heroText: 'Hero', tagline: '  Built to last  ' },
      'Built to last',
      'built-to-last',
    ],
    [
      'hero text',
      { companyName: '', heroText: '  Ship faster  ', tagline: ' ' },
      'Ship faster',
      'ship-faster',
    ],
  ] as const)(
    'selects %s for the preview label before lower-priority fields',
    async (_source, overrides, label, slug) => {
      brandScraperService.scrapeWebsite.mockResolvedValue(
        scrapedData(overrides),
      );

      const result = await service.previewWebsite(sourceUrl);

      expect(result.data.label).toBe(label);
      expect(result.data.slug).toBe(slug);
    },
  );

  it.each([
    [
      'description',
      {
        aboutText: 'About',
        description: '  Primary description  ',
        metaDescription: 'Meta',
        tagline: 'Tagline',
      },
      'Primary description',
    ],
    [
      'meta description',
      {
        aboutText: 'About',
        description: ' ',
        metaDescription: '  Meta description  ',
        tagline: 'Tagline',
      },
      'Meta description',
    ],
    [
      'about text',
      {
        aboutText: '  About Acme  ',
        description: '',
        metaDescription: ' ',
        tagline: 'Tagline',
      },
      'About Acme',
    ],
    [
      'tagline',
      {
        aboutText: ' ',
        description: '',
        metaDescription: undefined,
        tagline: '  Durable tools  ',
      },
      'Durable tools',
    ],
  ] as const)(
    'uses %s as the first available description',
    async (_source, overrides, description) => {
      brandScraperService.scrapeWebsite.mockResolvedValue(
        scrapedData(overrides),
      );

      const result = await service.previewWebsite(sourceUrl);

      expect(result.data.description).toBe(description);
    },
  );

  it('maps the resolved logo, colors, source, and website deterministically', async () => {
    brandScraperService.scrapeWebsite.mockResolvedValue(
      scrapedData({
        companyName: 'Acme',
        logoUrl: 'https://cdn.acme.com/logo.svg',
        ogImage: 'https://cdn.acme.com/social-card.jpg',
        primaryColor: '#111111',
        secondaryColor: '#eeeeee',
      }),
    );

    const result = await service.previewWebsite('https://input.acme.com');

    expect(brandScraperService.scrapeWebsite).toHaveBeenCalledWith(
      'https://input.acme.com',
    );
    expect(result).toEqual({
      data: {
        description: undefined,
        label: 'Acme',
        logoUrl: 'https://cdn.acme.com/logo.svg',
        primaryColor: '#111111',
        secondaryColor: '#eeeeee',
        slug: 'acme',
        sourceUrl,
        websiteUrl: sourceUrl,
      },
    });
  });

  it('never substitutes the Open Graph image for an unresolved logo', async () => {
    brandScraperService.scrapeWebsite.mockResolvedValue(
      scrapedData({
        companyName: 'Acme',
        ogImage: 'https://cdn.acme.com/social-card.jpg',
      }),
    );

    const result = await service.previewWebsite(sourceUrl);

    expect(result.data.logoUrl).toBeUndefined();
  });

  it('translates scraper failures into HTTP 400 with the scraper message', async () => {
    brandScraperService.scrapeWebsite.mockRejectedValue(
      new Error('Website unavailable'),
    );

    try {
      await service.previewWebsite(sourceUrl);
      expect.unreachable('expected a BadRequestException');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getStatus()).toBe(
        HttpStatus.BAD_REQUEST,
      );
      expect((error as BadRequestException).message).toBe(
        'Website unavailable',
      );
    }
  });

  it('uses the stable fallback message for message-less scraper failures', async () => {
    brandScraperService.scrapeWebsite.mockRejectedValue(null);

    await expect(service.previewWebsite(sourceUrl)).rejects.toMatchObject({
      message: 'Could not load brand data from that website',
      status: HttpStatus.BAD_REQUEST,
    });
  });
});
