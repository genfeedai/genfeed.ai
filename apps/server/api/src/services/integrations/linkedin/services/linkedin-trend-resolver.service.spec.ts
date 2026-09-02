import { BrandScraperService } from '@api/services/brand-scraper/brand-scraper.service';
import { LinkedInTrendResolverService } from '@api/services/integrations/linkedin/services/linkedin-trend-resolver.service';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';

describe('LinkedInTrendResolverService', () => {
  const brandScraperService = {
    scrapeLinkedIn: vi.fn(),
  };
  const configService = {
    get: vi.fn(),
  };
  const loggerService = {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  let service: LinkedInTrendResolverService;

  beforeEach(() => {
    vi.clearAllMocks();
    configService.get.mockReturnValue(undefined);
    service = new LinkedInTrendResolverService(
      brandScraperService as unknown as BrandScraperService,
      configService as unknown as ConfigService,
      loggerService as unknown as LoggerService,
    );
  });

  it('derives live topics from scraped public LinkedIn pages', async () => {
    brandScraperService.scrapeLinkedIn.mockResolvedValueOnce({
      companyName: 'OpenAI',
      recentPosts: [
        'We are seeing strong momentum around #AI and enterprise adoption.',
        'Builders are shipping new workflows for #AI teams.',
      ],
      scrapedAt: new Date('2026-03-26T10:00:00.000Z'),
      sourceUrl: 'https://www.linkedin.com/company/openai/',
    });
    brandScraperService.scrapeLinkedIn.mockResolvedValueOnce({
      companyName: 'Anthropic',
      recentPosts: [
        'Teams are investing more in #AI safety and enterprise deployment.',
      ],
      scrapedAt: new Date('2026-03-26T10:00:00.000Z'),
      sourceUrl: 'https://www.linkedin.com/company/anthropic-ai/',
    });
    brandScraperService.scrapeLinkedIn.mockResolvedValue({
      companyName: 'Other',
      recentPosts: [],
      scrapedAt: new Date('2026-03-26T10:00:00.000Z'),
      sourceUrl: 'https://www.linkedin.com/company/other/',
    });

    const trends = await service.resolve();

    expect(trends.length).toBeGreaterThan(0);
    expect(trends[0]?.topic).toBe('#ai');
    expect(trends[0]?.metadata.source).toBe('public-scrape');
    expect(trends[0]?.metadata.sourceClassification).toMatchObject({
      confidence: 'medium',
      intendedUse: 'organic_trend_discovery',
      sourceKind: 'public_platform_reference',
    });
    expect(trends[0]?.mentions).toBeGreaterThan(1);
  });

  it('falls back to configured public reference topics when scraping yields no signal', async () => {
    brandScraperService.scrapeLinkedIn.mockResolvedValue({
      companyName: 'Empty',
      recentPosts: [],
      scrapedAt: new Date('2026-03-26T10:00:00.000Z'),
      sourceUrl: 'https://www.linkedin.com/company/empty/',
    });

    const trends = await service.resolve('org-123', 'brand-456');

    expect(trends.length).toBeGreaterThan(0);
    expect(trends[0]).toEqual(
      expect.objectContaining({
        metadata: expect.objectContaining({
          source: 'public-reference',
          sourceClassification: expect.objectContaining({
            intendedUse: 'organic_trend_discovery',
            sourceKind: 'public_platform_reference',
          }),
        }),
        topic: '#openai',
      }),
    );
    expect(loggerService.warn).toHaveBeenCalled();
  });
});
