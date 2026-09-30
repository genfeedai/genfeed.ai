import { BrandVoiceGenerationException } from '@api/collections/brands/exceptions/brand-voice-generation.exception';
import type { BrandDocument } from '@api/collections/brands/schemas/brand.schema';
import {
  type BrandFinder,
  BrandGenerationService,
} from '@api/collections/brands/services/brand-generation.service';
import type { BrandVoiceCorpusService } from '@api/collections/brands/services/brand-voice-corpus.service';
import {
  buildVoiceCorpus,
  EMPTY_CORPUS_GUIDANCE,
  toPastedCandidates,
} from '@api/collections/brands/utils/brand-voice-corpus.util';
import type { BrandScraperService } from '@api/services/brand-scraper/brand-scraper.service';
import type { LlmDispatcherService } from '@api/services/integrations/llm/llm-dispatcher.service';
import {
  BrandVoiceFailureCode,
  type IBrandVoiceCorpusCandidate,
} from '@genfeedai/contracts/interfaces';
import type { LoggerService } from '@libs/logger/logger.service';
import { HttpStatus } from '@nestjs/common';
import type { Mock } from 'vitest';

describe('BrandGenerationService', () => {
  const organizationId = 'org-1';
  let brandScraperService: {
    scrapeWebsite: ReturnType<typeof vi.fn>;
    validateUrl: ReturnType<typeof vi.fn>;
  };
  let brandVoiceCorpusService: { buildCorpus: ReturnType<typeof vi.fn> };
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
    brandVoiceCorpusService = {
      buildCorpus: vi.fn().mockResolvedValue(buildVoiceCorpus([])),
    };
    findBrand = vi.fn<BrandFinder>();
    llmDispatcherService = { chatCompletion: vi.fn() };
    logger = { debug: vi.fn(), warn: vi.fn() };
    service = new BrandGenerationService(
      brandScraperService as unknown as BrandScraperService,
      llmDispatcherService as unknown as LlmDispatcherService,
      logger as unknown as LoggerService,
      brandVoiceCorpusService as unknown as BrandVoiceCorpusService,
    );
  });

  it('rejects an invalid source URL before scraping', async () => {
    brandScraperService.validateUrl.mockReturnValue({
      error: 'Invalid URL',
      isValid: false,
    });

    const error = await captureRejection(
      service.generateBrandVoice({ url: 'invalid' }, organizationId, findBrand),
    );

    expect(error).toBeInstanceOf(BrandVoiceGenerationException);
    const exception = error as BrandVoiceGenerationException;
    expect(exception.code).toBe(BrandVoiceFailureCode.SOURCE_URL_INVALID);
    expect(exception.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    // The scraper knows why the URL was refused, so its reason wins.
    expect(exception.message).toBe('Invalid URL');
    expect(exception.isRetryable).toBe(false);
    expect(brandScraperService.scrapeWebsite).not.toHaveBeenCalled();
  });

  it('scopes stored brand lookup to the organization', async () => {
    findBrand.mockResolvedValue(null);

    const error = await captureRejection(
      service.generateBrandVoice(
        { brandId: 'brand-1' },
        organizationId,
        findBrand,
      ),
    );

    expect(error).toBeInstanceOf(BrandVoiceGenerationException);
    expect((error as BrandVoiceGenerationException).code).toBe(
      BrandVoiceFailureCode.BRAND_NOT_FOUND,
    );
    expect(findBrand).toHaveBeenCalledWith({
      id: 'brand-1',
      isDeleted: false,
      organizationId,
    });
  });

  it('requires either a URL or a stored brand', async () => {
    const error = await captureRejection(
      service.generateBrandVoice({}, organizationId, findBrand),
    );

    expect(error).toBeInstanceOf(BrandVoiceGenerationException);
    expect((error as BrandVoiceGenerationException).code).toBe(
      BrandVoiceFailureCode.SOURCE_REQUIRED,
    );
    expect(llmDispatcherService.chatCompletion).not.toHaveBeenCalled();
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

      expect(error).toBeInstanceOf(BrandVoiceGenerationException);
      const exception = error as BrandVoiceGenerationException;
      expect(exception.getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
      expect(exception.getResponse()).toMatchObject({
        code: BrandVoiceFailureCode.MALFORMED_OUTPUT,
        meta: { isRetryable: true },
        title: 'Brand voice generation failed',
      });
      expect(exception.diagnostics).toEqual({
        code: BrandVoiceFailureCode.MALFORMED_OUTPUT,
        isRetryable: true,
        missingFields: [],
        outputLength: 'not-json'.length,
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

      expect(error).toBeInstanceOf(BrandVoiceGenerationException);
      expect(
        (error as BrandVoiceGenerationException).diagnostics,
      ).toMatchObject({
        code: BrandVoiceFailureCode.INCOMPLETE_PROFILE,
        missingFields: ['style', 'audience', 'topics'],
      });
      expect((error as BrandVoiceGenerationException).message).toContain(
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

      expect(error).toBeInstanceOf(BrandVoiceGenerationException);
      expect(
        (error as BrandVoiceGenerationException).diagnostics,
      ).toMatchObject({
        code: BrandVoiceFailureCode.EMPTY_OUTPUT,
        outputLength: 0,
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
        'Brand voice generation failed',
        expect.objectContaining({
          brandId: 'brand-1',
          code: BrandVoiceFailureCode.MALFORMED_OUTPUT,
          isRetryable: true,
          organizationId,
        }),
      );
      const [, context] = logger.warn.mock.calls[0] as [string, object];
      expect(JSON.stringify(context)).not.toContain(payloadMarker);
      expect(
        JSON.stringify((error as BrandVoiceGenerationException).getResponse()),
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

  describe('own-posts voice corpus', () => {
    const validProfile = {
      audience: ['founders'],
      goals: ['grow'],
      messagingPillars: ['shipping'],
      style: 'terse',
      tone: 'blunt',
      topics: ['shipping'],
    };

    function ownCandidate(
      id: string,
      text: string,
      kind: 'original' | 'reply',
      day: number,
    ): IBrandVoiceCorpusCandidate {
      return {
        engagement: null,
        id,
        kind,
        origin: 'own-account',
        platform: 'twitter',
        publishedAt: `2026-09-${String(day).padStart(2, '0')}T12:00:00.000Z`,
        text,
      };
    }

    const replies = Array.from({ length: 8 }, (_, index) =>
      ownCandidate(
        `r-${index}`,
        `@friend nah, reply number ${index} is fine`,
        'reply',
        index + 1,
      ),
    );
    const originals = Array.from({ length: 6 }, (_, index) =>
      ownCandidate(
        `o-${index}`,
        `shipped thing ${index} today, docs later`,
        'original',
        index + 10,
      ),
    );

    beforeEach(() => {
      findBrand.mockResolvedValue(storedBrand);
    });

    function promptSent(): string {
      const [request] = llmDispatcherService.chatCompletion.mock.calls[0] as [
        { messages: Array<{ content: string }> },
      ];
      return request.messages[0]?.content ?? '';
    }

    it('scopes the corpus to the organization and brand and forwards pasted samples', async () => {
      stubProviderOutput(JSON.stringify(validProfile));

      await service.generateBrandVoice(
        { brandId: 'brand-1', samples: ['my own words'] },
        organizationId,
        findBrand,
      );

      expect(brandVoiceCorpusService.buildCorpus).toHaveBeenCalledWith({
        brandId: 'brand-1',
        organizationId,
        pastedSamples: ['my own words'],
      });
    });

    it('puts measured stats and verbatim real posts into the prompt', async () => {
      brandVoiceCorpusService.buildCorpus.mockResolvedValue(
        buildVoiceCorpus([...replies, ...originals]),
      );
      stubProviderOutput(JSON.stringify(validProfile));

      await service.generateBrandVoice(
        { brandId: 'brand-1' },
        organizationId,
        findBrand,
      );

      const prompt = promptSent();
      expect(prompt).toContain("Voice evidence: the brand's OWN writing");
      expect(prompt).toContain(
        'Samples measured: 14 (8 replies, 6 original posts)',
      );
      expect(prompt).toContain('@friend nah, reply number 0 is fine');
      expect(prompt).toContain('shipped thing 5 today, docs later');
      expect(prompt).toContain('exemplarIds');
      expect(prompt).toContain('Never rewrite, merge, or invent a post.');
    });

    it('returns only verbatim corpus exemplars, measured rules, and the corpus summary', async () => {
      const corpus = buildVoiceCorpus([...replies, ...originals]);
      brandVoiceCorpusService.buildCorpus.mockResolvedValue(corpus);
      stubProviderOutput(
        JSON.stringify({
          ...validProfile,
          exemplarIds: [1, 2, 500],
          exemplarTexts: ['an invented line that sounds nice'],
          writingRules: ['Push back before agreeing'],
        }),
      );

      const profile = await service.generateBrandVoice(
        { brandId: 'brand-1' },
        organizationId,
        findBrand,
      );

      const corpusTexts = corpus.samples.map((sample) => sample.text);
      expect(profile.exemplarTexts).toHaveLength(2);
      for (const exemplar of profile.exemplarTexts) {
        expect(corpusTexts).toContain(exemplar);
      }
      expect(profile.exemplarTexts).not.toContain(
        'an invented line that sounds nice',
      );
      expect(profile.writingRules).toEqual(
        expect.arrayContaining([
          'Do not use emojis',
          'Never use em dashes',
          'Push back before agreeing',
        ]),
      );
      expect(profile.corpus).toEqual(corpus.summary);
      expect(profile.corpus.isSufficient).toBe(true);
      expect(profile.corpus.label).toContain('own posts: 14 samples');
    });

    it('explains an empty corpus and keeps the website-only draft free of invented exemplars', async () => {
      stubProviderOutput(
        JSON.stringify({
          ...validProfile,
          exemplarTexts: ['made up'],
          writingRules: ['made-up rule'],
        }),
      );

      const profile = await service.generateBrandVoice(
        { brandId: 'brand-1' },
        organizationId,
        findBrand,
      );

      expect(promptSent()).not.toContain('Voice evidence');
      expect(profile.exemplarTexts).toEqual([]);
      expect(profile.writingRules).toEqual([]);
      expect(profile.corpus).toMatchObject({
        guidance: EMPTY_CORPUS_GUIDANCE,
        isSufficient: false,
        sampleCount: 0,
      });
    });

    it('treats pasted samples as own writing when the corpus is otherwise empty', async () => {
      brandVoiceCorpusService.buildCorpus.mockResolvedValue(
        buildVoiceCorpus(toPastedCandidates(['lol no. ship it friday'])),
      );
      stubProviderOutput(JSON.stringify({ ...validProfile, exemplarIds: [1] }));

      const profile = await service.generateBrandVoice(
        { brandId: 'brand-1', samples: ['lol no. ship it friday'] },
        organizationId,
        findBrand,
      );

      expect(promptSent()).toContain('lol no. ship it friday');
      expect(profile.exemplarTexts).toEqual(['lol no. ship it friday']);
      expect(profile.corpus.isSufficient).toBe(false);
      expect(profile.corpus.guidance).toMatch(
        /^Only 1 post written by this brand was found/,
      );
    });
  });
});
