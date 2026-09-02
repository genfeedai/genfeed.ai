import { BrandsService } from '@api/collections/brands/services/brands.service';
import { NewslettersService } from '@api/collections/newsletters/services/newsletters.service';
import { NewsletterImportFeedService } from '@api/endpoints/public/services/newsletter-import-feed.service';
import { ConfigService } from '@libs/config/config.service';
import { Test, type TestingModule } from '@nestjs/testing';

const brand = {
  id: 'brand-1',
  isDeleted: false,
  label: 'Acme Dispatch',
  slug: 'acme',
};

const publishedNewsletter = {
  brandId: brand.id,
  content: '# Launch\n\nFull **newsletter** body.\n\n<script>alert(1)</script>',
  createdAt: new Date('2026-08-01T10:00:00.000Z'),
  id: 'newsletter-1',
  isDeleted: false,
  label: 'Launch issue',
  publishedAt: new Date('2026-08-02T10:00:00.000Z'),
  status: 'published',
  summary: 'The launch summary',
  updatedAt: new Date('2026-08-03T10:00:00.000Z'),
};

describe('NewsletterImportFeedService', () => {
  let service: NewsletterImportFeedService;
  let brandsService: { findOne: ReturnType<typeof vi.fn> };
  let newslettersService: {
    findAll: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    brandsService = {
      findOne: vi.fn().mockResolvedValue(brand),
    };
    newslettersService = {
      findAll: vi.fn().mockResolvedValue({ docs: [publishedNewsletter] }),
      findOne: vi.fn().mockResolvedValue(publishedNewsletter),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NewsletterImportFeedService,
        { provide: BrandsService, useValue: brandsService },
        { provide: NewslettersService, useValue: newslettersService },
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn((key: string) => {
              if (key === 'GENFEEDAI_API_URL') {
                return 'https://api.genfeed.ai/v1/';
              }
              if (key === 'GENFEEDAI_APP_URL') {
                return 'https://app.genfeed.ai/';
              }
              return undefined;
            }),
          },
        },
      ],
    }).compile();

    service = module.get(NewsletterImportFeedService);
  });

  afterEach(() => vi.clearAllMocks());

  it('emits the complete import contract with stable identity', async () => {
    const feed = await service.generateBrandFeed(brand.id);

    expect(feed).toContain('<title><![CDATA[Launch issue]]></title>');
    expect(feed).toContain('<h1>Launch</h1>');
    expect(feed).toContain('<strong>newsletter</strong>');
    expect(feed).toContain(
      '<link>https://api.genfeed.ai/v1/public/newsletters/newsletter-1</link>',
    );
    expect(feed).toContain(
      '<guid isPermaLink="false">urn:genfeed:newsletter:newsletter-1</guid>',
    );
    expect(feed).toContain('<pubDate>Sun, 02 Aug 2026 10:00:00 GMT</pubDate>');
    expect(feed).not.toContain('<script>');
    expect(feed).not.toContain('alert(1)');
  });

  it('queries only eligible public-import records within the brand, capped at 50 newest', async () => {
    await service.generateBrandFeed(brand.id);

    expect(brandsService.findOne).toHaveBeenCalledWith({
      id: brand.id,
      isDeleted: false,
    });
    // RSS convention: newest 50 items, never the whole published archive.
    expect(newslettersService.findAll).toHaveBeenCalledWith(
      {
        orderBy: [{ publishedAt: -1 }, { id: 1 }],
        where: {
          brandId: brand.id,
          content: { not: null },
          isDeleted: false,
          publishedAt: { not: null },
          status: 'published',
        },
      },
      { limit: 50, page: 1 },
      false,
    );
  });

  it('keeps the GUID stable when the same newsletter is updated', async () => {
    const firstFeed = await service.generateBrandFeed(brand.id);
    newslettersService.findAll.mockResolvedValue({
      docs: [
        {
          ...publishedNewsletter,
          content: '# Updated body',
          updatedAt: new Date('2026-08-04T10:00:00.000Z'),
        },
      ],
    });

    const updatedFeed = await service.generateBrandFeed(brand.id);
    const guid = 'urn:genfeed:newsletter:newsletter-1';

    expect(firstFeed).toContain(guid);
    expect(updatedFeed).toContain(guid);
    expect(updatedFeed).toContain('<h1>Updated body</h1>');
  });

  it('generates deterministic metadata for the same archive state', async () => {
    const firstFeed = await service.generateBrandFeed(brand.id);
    const secondFeed = await service.generateBrandFeed(brand.id);

    expect(secondFeed).toBe(firstFeed);
    expect(firstFeed).toContain(
      '<lastBuildDate>Mon, 03 Aug 2026 10:00:00 GMT</lastBuildDate>',
    );
  });

  it('returns an empty deterministic feed when the brand has no archive', async () => {
    newslettersService.findAll.mockResolvedValue({ docs: [] });

    const feed = await service.generateBrandFeed(brand.id);

    expect(feed).toContain(
      '<title><![CDATA[Acme Dispatch Newsletter]]></title>',
    );
    expect(feed).toContain(
      '<lastBuildDate>Thu, 01 Jan 1970 00:00:00 GMT</lastBuildDate>',
    );
    expect(feed).not.toContain('<item>');
  });

  it('rejects unknown or deleted brand boundaries', async () => {
    brandsService.findOne.mockResolvedValue(null);

    await expect(service.generateBrandFeed('missing-brand')).rejects.toThrow(
      "Brand with identifier 'missing-brand' not found",
    );
    expect(newslettersService.findAll).not.toHaveBeenCalled();
  });

  it('renders the canonical public page from the same eligibility contract', async () => {
    const page = await service.generateCanonicalPage(publishedNewsletter.id);

    expect(newslettersService.findOne).toHaveBeenCalledWith({
      content: { not: null },
      id: publishedNewsletter.id,
      isDeleted: false,
      publishedAt: { not: null },
      status: 'published',
    });
    expect(brandsService.findOne).toHaveBeenCalledWith({
      id: brand.id,
      isDeleted: false,
    });
    expect(page).toContain('<h1>Launch issue</h1>');
    expect(page).toContain('<h1>Launch</h1>');
    expect(page).toContain(
      '<link rel="canonical" href="https://api.genfeed.ai/v1/public/newsletters/newsletter-1">',
    );
    expect(page).not.toContain('<script>');
  });

  it('renders the canonical page with a system-responsive semantic palette', async () => {
    const page = await service.generateCanonicalPage(publishedNewsletter.id);

    expect(page).toContain('color-scheme: light dark');
    expect(page).toContain('@media (prefers-color-scheme: dark)');
    expect(page).toContain('background: var(--page-background)');
    expect(page).toContain('color: var(--page-foreground)');
    expect(page).not.toContain('background:#050607');
  });

  it('does not expose ineligible newsletters at canonical URLs', async () => {
    newslettersService.findOne.mockResolvedValue(null);

    await expect(
      service.generateCanonicalPage('private-newsletter'),
    ).rejects.toThrow(
      "Newsletter with identifier 'private-newsletter' not found",
    );
  });

  it('does not expose a newsletter after its publication brand is deleted', async () => {
    brandsService.findOne.mockResolvedValue(null);

    await expect(
      service.generateCanonicalPage(publishedNewsletter.id),
    ).rejects.toThrow("Brand with identifier 'brand-1' not found");
  });
});
