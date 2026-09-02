import type { BrandDocument } from '@api/collections/brands/schemas/brand.schema';
import { BrandGenerationService } from '@api/collections/brands/services/brand-generation.service';
import type { BrandScraperService } from '@api/services/brand-scraper/brand-scraper.service';
import type { LlmDispatcherService } from '@api/services/integrations/llm/llm-dispatcher.service';
import type { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';

describe('BrandGenerationService', () => {
  const organizationId = 'org-1';
  let brandScraperService: {
    scrapeWebsite: ReturnType<typeof vi.fn>;
    validateUrl: ReturnType<typeof vi.fn>;
  };
  let findBrand: ReturnType<typeof vi.fn>;
  let llmDispatcherService: { chatCompletion: ReturnType<typeof vi.fn> };
  let service: BrandGenerationService;

  beforeEach(() => {
    brandScraperService = {
      scrapeWebsite: vi.fn(),
      validateUrl: vi.fn().mockReturnValue({ isValid: true }),
    };
    findBrand = vi.fn();
    llmDispatcherService = { chatCompletion: vi.fn() };
    service = new BrandGenerationService(
      brandScraperService as unknown as BrandScraperService,
      llmDispatcherService as unknown as LlmDispatcherService,
      {
        debug: vi.fn(),
        warn: vi.fn(),
      } as unknown as LoggerService,
    );
  });

  it('rejects an invalid source URL before scraping', async () => {
    brandScraperService.validateUrl.mockReturnValue({
      error: 'Invalid URL',
      isValid: false,
    });

    await expect(
      service.generateBrandVoice({ url: 'invalid' }, organizationId, findBrand),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(brandScraperService.scrapeWebsite).not.toHaveBeenCalled();
  });

  it('scopes stored brand lookup to the organization', async () => {
    findBrand.mockResolvedValue(null);

    await expect(
      service.generateBrandVoice(
        { brandId: 'brand-1' },
        organizationId,
        findBrand,
      ),
    ).rejects.toThrow('Brand not found');
    expect(findBrand).toHaveBeenCalledWith({
      id: 'brand-1',
      isDeleted: false,
      organizationId,
    });
  });

  it('requires either a URL or a stored brand', async () => {
    await expect(
      service.generateBrandVoice({}, organizationId, findBrand),
    ).rejects.toThrow('Either url or brandId must be provided');
  });

  it('generates a normalized brand profile from website evidence', async () => {
    brandScraperService.scrapeWebsite.mockResolvedValue({
      companyName: 'Acme',
      description: 'Automation for founders',
      tagline: 'Ship faster',
      valuePropositions: ['Fast'],
    });
    llmDispatcherService.chatCompletion.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              audience: ['founders'],
              goals: ['increase adoption'],
              messagingPillars: ['automation'],
              promptSeeds: [],
              style: 'direct',
              tone: 'bold',
              topics: ['automation'],
            }),
          },
        },
      ],
    });

    await expect(
      service.generateBrandVoice(
        { url: 'https://example.com' },
        organizationId,
        findBrand,
      ),
    ).resolves.toMatchObject({
      audience: ['founders'],
      style: 'direct',
      tone: 'bold',
    });
    expect(llmDispatcherService.chatCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [expect.objectContaining({ role: 'user' })],
      }),
      organizationId,
    );
  });

  it('maps an invalid model response to the stable generation error', async () => {
    findBrand.mockResolvedValue({
      description: 'A brand',
      id: 'brand-1',
      label: 'Acme',
    } as BrandDocument);
    llmDispatcherService.chatCompletion.mockResolvedValue({
      choices: [{ message: { content: 'not-json' } }],
    });

    await expect(
      service.generateBrandVoice(
        { brandId: 'brand-1' },
        organizationId,
        findBrand,
      ),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });
});
