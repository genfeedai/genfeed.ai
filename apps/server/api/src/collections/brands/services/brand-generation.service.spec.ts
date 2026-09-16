import {
  BRAND_PROFILE_GENERATION_INVALID_CODE,
  BrandProfileGenerationException,
} from '@api/collections/brands/exceptions/brand-profile-generation.exception';
import type { BrandDocument } from '@api/collections/brands/schemas/brand.schema';
import {
  type BrandFinder,
  BrandGenerationService,
} from '@api/collections/brands/services/brand-generation.service';
import type { BrandScraperService } from '@api/services/brand-scraper/brand-scraper.service';
import type { LlmDispatcherService } from '@api/services/integrations/llm/llm-dispatcher.service';
import { BrandProfileGenerationFailureReason } from '@genfeedai/contracts';
import type { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, HttpStatus } from '@nestjs/common';
import type { Mock } from 'vitest';

describe('BrandGenerationService', () => {
  const organizationId = 'org-1';
  let brandScraperService: {
    scrapeWebsite: ReturnType<typeof vi.fn>;
    validateUrl: ReturnType<typeof vi.fn>;
  };
  let findBrand: Mock<BrandFinder>;
  let llmDispatcherService: { chatCompletion: ReturnType<typeof vi.fn> };
  let logger: {
    debug: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };
  let service: BrandGenerationService;

  const storedBrand = {
    description: 'A brand',
    id: 'brand-1',
    label: 'Acme',
  } as BrandDocument;

  function stubProviderOutput(content: string): void {
    llmDispatcherService.chatCompletion.mockResolvedValue({
      choices: [{ message: { content } }],
    });
  }

  async function captureRejection(promise: Promise<unknown>): Promise<unknown> {
    try {
      await promise;
    } catch (error: unknown) {
      return error;
    }
    throw new Error('Expected the promise to reject');
  }

  beforeEach(() => {
    brandScraperService = {
      scrapeWebsite: vi.fn(),
      validateUrl: vi.fn().mockReturnValue({ isValid: true }),
    };
    findBrand = vi.fn<BrandFinder>();
    llmDispatcherService = { chatCompletion: vi.fn() };
    logger = { debug: vi.fn(), warn: vi.fn() };
    service = new BrandGenerationService(
      brandScraperService as unknown as BrandScraperService,
      llmDispatcherService as unknown as LlmDispatcherService,
      logger as unknown as LoggerService,
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

  describe('invalid provider output', () => {
    beforeEach(() => {
      findBrand.mockResolvedValue(storedBrand);
    });

    it('returns a classified 422 instead of an internal server error', async () => {
      stubProviderOutput('not-json');

      const error = await captureRejection(
        service.generateBrandVoice(
          { brandId: 'brand-1' },
          organizationId,
          findBrand,
        ),
      );

      expect(error).toBeInstanceOf(BrandProfileGenerationException);
      const exception = error as BrandProfileGenerationException;
      expect(exception.getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
      expect(exception.getResponse()).toMatchObject({
        code: BRAND_PROFILE_GENERATION_INVALID_CODE,
        title: 'Brand profile generation failed',
      });
      expect(exception.diagnostics).toEqual({
        isRetryable: true,
        missingFields: [],
        outputLength: 'not-json'.length,
        reason: BrandProfileGenerationFailureReason.MALFORMED_JSON,
      });
    });

    it('names the missing fields when the profile is incomplete', async () => {
      stubProviderOutput(JSON.stringify({ tone: 'bold' }));

      const error = await captureRejection(
        service.generateBrandVoice(
          { brandId: 'brand-1' },
          organizationId,
          findBrand,
        ),
      );

      expect(error).toBeInstanceOf(BrandProfileGenerationException);
      expect(
        (error as BrandProfileGenerationException).diagnostics,
      ).toMatchObject({
        missingFields: ['style', 'audience', 'topics'],
        reason: BrandProfileGenerationFailureReason.MISSING_REQUIRED_FIELDS,
      });
      expect((error as BrandProfileGenerationException).message).toContain(
        'missing style, audience, topics',
      );
    });

    it('classifies an empty completion as empty output', async () => {
      llmDispatcherService.chatCompletion.mockResolvedValue({ choices: [] });

      const error = await captureRejection(
        service.generateBrandVoice(
          { brandId: 'brand-1' },
          organizationId,
          findBrand,
        ),
      );

      expect(error).toBeInstanceOf(BrandProfileGenerationException);
      expect(
        (error as BrandProfileGenerationException).diagnostics,
      ).toMatchObject({
        outputLength: 0,
        reason: BrandProfileGenerationFailureReason.EMPTY_OUTPUT,
      });
    });

    it('logs redacted diagnostics without the provider payload', async () => {
      const payloadMarker = 'provider-payload-marker';
      stubProviderOutput(`{"tone": "${payloadMarker}"`);

      const error = await captureRejection(
        service.generateBrandVoice(
          { brandId: 'brand-1' },
          organizationId,
          findBrand,
        ),
      );

      expect(logger.warn).toHaveBeenCalledWith(
        'Generated brand profile failed validation',
        expect.objectContaining({
          brandId: 'brand-1',
          isRetryable: true,
          organizationId,
          reason: BrandProfileGenerationFailureReason.MALFORMED_JSON,
        }),
      );
      const [, context] = logger.warn.mock.calls[0] as [string, object];
      expect(JSON.stringify(context)).not.toContain(payloadMarker);
      expect(
        JSON.stringify(
          (error as BrandProfileGenerationException).getResponse(),
        ),
      ).not.toContain(payloadMarker);
    });

    it('does not persist anything and leaves the stored brand untouched', async () => {
      stubProviderOutput('[]');

      await captureRejection(
        service.generateBrandVoice(
          { brandId: 'brand-1' },
          organizationId,
          findBrand,
        ),
      );

      // The only brand access on this path is the org-scoped read.
      expect(findBrand).toHaveBeenCalledTimes(1);
      expect(findBrand).toHaveBeenCalledWith({
        id: 'brand-1',
        isDeleted: false,
        organizationId,
      });
      expect(storedBrand).toEqual({
        description: 'A brand',
        id: 'brand-1',
        label: 'Acme',
      });
    });

    it('lets genuine provider faults propagate unclassified', async () => {
      const providerFault = new Error('upstream timeout');
      llmDispatcherService.chatCompletion.mockRejectedValue(providerFault);

      const error = await captureRejection(
        service.generateBrandVoice(
          { brandId: 'brand-1' },
          organizationId,
          findBrand,
        ),
      );

      expect(error).toBe(providerFault);
      expect(logger.warn).not.toHaveBeenCalled();
    });
  });
});
