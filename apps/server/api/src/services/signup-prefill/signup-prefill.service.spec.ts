import type { BrandDataMapper } from '@api/collections/brands/services/brand-data.mapper';
import type { BrandPersistenceService } from '@api/collections/brands/services/brand-persistence.service';
import type { BrandsService } from '@api/collections/brands/services/brands.service';
import type { HarnessProfilesService } from '@api/collections/harness-profiles/services/harness-profiles.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import type { BrandScraperService } from '@api/services/brand-scraper/brand-scraper.service';
import type { MasterPromptGeneratorService } from '@api/services/knowledge-base/master-prompt-generator.service';
import {
  SignupPrefillService,
  type SignupPrefillState,
} from '@api/services/signup-prefill/signup-prefill.service';
import { getActionDefinition } from '@genfeedai/actions';
import { compileActionContract } from '@genfeedai/workflows/engine';
import type { LoggerService } from '@libs/logger/logger.service';
import { getTenantContext } from '@libs/prisma/tenant-context';
import { resolveSafeDestination } from '@libs/security/destination-guard';
import {
  BadRequestException,
  ConflictException,
  RequestTimeoutException,
} from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@libs/security/destination-guard', () => ({
  resolveSafeDestination: vi.fn().mockResolvedValue({}),
}));
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

const provenance = {
  nodeId: 'scrape',
  runId: 'run-1',
  workflowId: 'signup.prefill',
  workflowVersionId: 'v1',
};

function createHarness() {
  const scrapedData = {
    companyName: 'Acme',
    description: 'Brand details',
    aboutText: undefined,
    sourceUrl: 'https://acme.example/',
    scrapedAt: new Date('2026-10-01T10:00:00.000Z'),
    socialLinks: {
      twitter: undefined,
      linkedin: 'https://linkedin.com/company/acme',
    },
  };
  const scraper = {
    scrapeWebsite: vi.fn().mockResolvedValue(scrapedData),
    scrapeWebsiteWithEvidence: vi.fn().mockResolvedValue({ data: scrapedData }),
  };
  const generator = { analyzeBrandVoice: vi.fn().mockResolvedValue(undefined) };
  const brands = {
    findOne: vi.fn().mockResolvedValue({
      agentConfig: {},
      label: 'Acme',
      description: 'Owner summary',
      text: 'Owner prompt',
    }),
    updateAgentConfig: vi.fn(),
    patch: vi.fn(),
  };
  const mapper = {
    readBrandAgentConfig: vi
      .fn()
      .mockImplementation((config: unknown) => config),
    buildFallbackScrapedData: vi.fn().mockReturnValue({
      sourceUrl: 'https://acme.example/',
      scrapedAt: new Date(),
      socialLinks: {},
    }),
  };
  const persistence = {
    updateBrandWithScrapedData: vi.fn(),
    upsertBrandWebsiteLink: vi.fn(),
    upsertBrandSocialLinks: vi.fn(),
    autofillScrapedBrandAssets: vi.fn(),
    updateBrandGuidance: vi.fn(),
    syncBrandAndOrgSlug: vi.fn(),
  };
  const harness = {
    findForBrand: vi.fn().mockResolvedValue([]),
    create: vi.fn(),
  };
  const logger = { warn: vi.fn() };
  const service = new SignupPrefillService(
    logger as unknown as LoggerService,
    brands as unknown as BrandsService,
    scraper as unknown as BrandScraperService,
    mapper as unknown as BrandDataMapper,
    persistence as unknown as BrandPersistenceService,
    generator as unknown as MasterPromptGeneratorService,
    harness as unknown as HarnessProfilesService,
  );
  const state: SignupPrefillState = {
    brandDomain: 'acme.example',
    brandLabel: 'Acme',
    config: {},
    request: { brandId: 'brand-1', organizationId: 'org-1', userId: 'user-1' },
    status: 'running',
    websiteUrl: 'https://acme.example/',
  };
  return {
    service,
    logger,
    state,
    scrapedData,
    generator,
    persistence,
    harness,
    brands,
    scraper,
    mapper,
  };
}

describe('SignupPrefillService workflow scrape boundary', () => {
  it('emits JSON-safe data that passes the real scrape output contract', async () => {
    const h = createHarness();
    const output = await h.service.scrapePrefill(h.state);
    const action = getActionDefinition('signup.prefill.scrape');
    if (!action) throw new Error('Missing signup scrape contract');
    const contract = compileActionContract(action.id, {
      inputSchema: action.inputSchema as Readonly<Record<string, unknown>>,
      outputSchema: action.outputSchema as Readonly<Record<string, unknown>>,
    });
    expect(() =>
      contract.validateOutput(
        { ...h.state, scrapedData: h.scrapedData },
        provenance,
      ),
    ).toThrow('Action contract output validation failed');
    expect(() => contract.validateOutput(output, provenance)).not.toThrow();
    expect(output.scrapedData?.scrapedAt).toBe('2026-10-01T10:00:00.000Z');
    expect(output.scrapedData).not.toHaveProperty('aboutText');
    expect(output.scrapedData?.socialLinks).not.toHaveProperty('twitter');
    expect(h.scrapedData.scrapedAt).toBeInstanceOf(Date);
    await h.service.analyzePrefill(output);
    expect(h.generator.analyzeBrandVoice).toHaveBeenCalledWith(
      expect.objectContaining({
        description: 'Brand details',
        scrapedAt: h.scrapedData.scrapedAt,
      }),
      { organizationId: 'org-1', userId: 'user-1' },
      { deadlineAt: undefined, onCreditsSettled: expect.any(Function) },
    );
  });
  it('preserves JSON-safe scrape state through every downstream action', async () => {
    const h = createHarness();
    let state = await h.service.scrapePrefill(h.state);
    const steps = [
      [
        'signup.prefill.analyze',
        (input: SignupPrefillState) => h.service.analyzePrefill(input),
      ],
      [
        'signup.prefill.apply-defaults',
        (input: SignupPrefillState) => h.service.applyPrefillDefaults(input),
      ],
      [
        'signup.prefill.apply-prompt',
        (input: SignupPrefillState) => h.service.applyPrefillPrompt(input),
      ],
      [
        'signup.prefill.seed-harness',
        (input: SignupPrefillState) => h.service.applyPrefillHarness(input),
      ],
    ] as const;
    for (const [actionId, apply] of steps) {
      const action = getActionDefinition(actionId);
      if (!action) throw new Error(`Missing action ${actionId}`);
      const contract = compileActionContract(actionId, {
        inputSchema: action.inputSchema as Readonly<Record<string, unknown>>,
        outputSchema: action.outputSchema as Readonly<Record<string, unknown>>,
      });
      expect(() => contract.validateInput({ state }, provenance)).not.toThrow();
      state = await apply(state);
      expect(() => contract.validateOutput(state, provenance)).not.toThrow();
      expect(state.scrapedData?.scrapedAt).toBe('2026-10-01T10:00:00.000Z');
    }
    expect(h.persistence.updateBrandWithScrapedData).toHaveBeenCalledWith(
      'brand-1',
      expect.objectContaining({ scrapedAt: h.scrapedData.scrapedAt }),
      { brandUrl: 'https://acme.example/' },
      'Acme',
    );
    expect(state.hasHarnessProfile).toBe(true);
    expect(h.harness.create).toHaveBeenCalled();
  });
});

describe('SignupPrefillService explicit URL scan', () => {
  it.each([
    ['https://instagram.com/@acme', undefined, 'acme'],
    ['https://instagram.com/acme', 'Instagram', 'acme'],
    ['https://linktr.ee/acme', 'Linktree', 'acme'],
    ['https://linkedin.com/company/acme', undefined, 'acme'],
    ['https://beacons.ai/acme', undefined, 'acme'],
    ['https://etsy.com/shop/acme', undefined, 'acme'],
    ['https://youtube.com/@acme', 'Real company', 'Real company'],
    ['https://instagram.com/', undefined, 'Acme'],
  ])(
    'uses profile identity for %s with company %s',
    async (url, companyName, expected) => {
      const h = createHarness();
      h.scraper.scrapeWebsiteWithEvidence.mockResolvedValue({
        data: { ...h.scrapedData, companyName },
      });
      const state = await h.service.scanBrandUrl(h.state.request, url);
      expect(state.brandLabel).toBe(expected);
      expect(h.persistence.syncBrandAndOrgSlug).toHaveBeenCalledWith(
        expected,
        'org-1',
        'brand-1',
        expected,
        true,
      );
    },
  );

  it('reports settled analysis credits and passes the scan deadline', async () => {
    const h = createHarness();
    const report = vi.fn();
    h.generator.analyzeBrandVoice.mockImplementation(
      async (_data, _billing, options) => {
        expect(options.deadlineAt).toEqual(expect.any(Number));
        options.onCreditsSettled(1);
        return { tone: 'Friendly' };
      },
    );
    const state = await h.service.scanBrandUrl(
      h.state.request,
      'https://acme.example',
      report,
    );
    expect(state.creditsUsed).toBe(1);
    expect(report).toHaveBeenCalledWith(1);
  });

  it('rejects concurrent same-brand scans but releases the guard after completion', async () => {
    const h = createHarness();
    let complete: ((value: { data: typeof h.scrapedData }) => void) | undefined;
    h.scraper.scrapeWebsiteWithEvidence.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const scan = h.service.scanBrandUrl(
      h.state.request,
      'https://acme.example',
    );
    await expect(
      h.service.scanBrandUrl(h.state.request, 'https://acme.example'),
    ).rejects.toBeInstanceOf(ConflictException);
    for (let i = 0; i < 20 && !complete; i++) await Promise.resolve();
    expect(complete).toBeDefined();
    complete?.({ data: h.scrapedData });
    await scan;
    expect(
      (await h.service.scanBrandUrl(h.state.request, 'https://acme.example'))
        .status,
    ).toBe('completed');
  });

  it('records failed markers for a persistence error using the latest answers', async () => {
    const h = createHarness();
    h.persistence.updateBrandWithScrapedData.mockImplementation(() => {
      h.brands.findOne.mockResolvedValue({
        agentConfig: {
          strategy: { goals: ['Sales'] },
          signupPrefill: { startedAt: 'new-marker' },
        },
        label: 'Acme',
        description: '',
        text: '',
      });
      throw new Error('write failed');
    });
    await expect(
      h.service.scanBrandUrl(h.state.request, 'https://acme.example'),
    ).rejects.toThrow('write failed');
    expect(h.brands.updateAgentConfig).toHaveBeenLastCalledWith(
      'brand-1',
      'org-1',
      expect.objectContaining({
        signupPrefill: expect.objectContaining({
          status: 'failed',
          startedAt: 'new-marker',
        }),
      }),
    );
  });

  it('preserves answers saved after prepare across defaults and final marker writes', async () => {
    const h = createHarness();
    h.scraper.scrapeWebsiteWithEvidence.mockImplementation(async () => {
      h.brands.findOne.mockResolvedValue({
        agentConfig: {
          strategy: { goals: ['Sales'], platforms: ['linkedin'] },
          voice: { tone: 'Owner tone' },
        },
        label: 'Acme',
        description: '',
        text: '',
      });
      return { data: h.scrapedData };
    });
    await h.service.scanBrandUrl(h.state.request, 'https://acme.example');
    expect(
      h.brands.updateAgentConfig.mock.calls.at(-1)?.[2],
    ).not.toHaveProperty('strategy');
    expect(
      h.brands.updateAgentConfig.mock.calls.at(-1)?.[2],
    ).not.toHaveProperty('voice');
    for (const [, , config] of h.brands.updateAgentConfig.mock.calls.slice(
      1,
      -1,
    )) {
      expect(config).toMatchObject({
        strategy: { goals: ['Sales'], platforms: ['linkedin'] },
        voice: { tone: 'Owner tone' },
      });
    }
  });

  it('marks an analysis timeout failed and skips persistence', async () => {
    const h = createHarness();
    h.generator.analyzeBrandVoice.mockRejectedValue(
      new RequestTimeoutException(),
    );
    await expect(
      h.service.scanBrandUrl(h.state.request, 'https://acme.example'),
    ).rejects.toBeInstanceOf(RequestTimeoutException);
    expect(h.persistence.updateBrandWithScrapedData).not.toHaveBeenCalled();
    expect(h.brands.updateAgentConfig).toHaveBeenLastCalledWith(
      'brand-1',
      'org-1',
      expect.objectContaining({
        signupPrefill: expect.objectContaining({ status: 'failed' }),
      }),
    );
  });

  it('rethrows a timeout reached while seeding the harness', async () => {
    const h = createHarness();
    h.harness.findForBrand.mockRejectedValue(new RequestTimeoutException());
    await expect(h.service.applyPrefillHarness(h.state)).rejects.toBeInstanceOf(
      RequestTimeoutException,
    );
  });

  it('logs signup scrape error and sanitized URL detail', async () => {
    const h = createHarness();
    h.scraper.scrapeWebsite.mockRejectedValue(new Error('scrape broke'));
    await h.service.scrapePrefill({
      ...h.state,
      websiteUrl: 'https://acme.example/?token=secret',
    });
    expect(h.logger.warn).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        error: 'scrape broke',
        websiteUrl: 'https://acme.example/',
      }),
    );
  });

  it('runs all stages, uses the scanned name and scopes persistence', async () => {
    const h = createHarness();
    h.persistence.updateBrandWithScrapedData.mockImplementation(() => {
      expect(getTenantContext()?.organizationId).toBe('org-1');
    });
    const state = await h.service.scanBrandUrl(
      h.state.request,
      'acme.example/products#about',
    );
    expect(state).toMatchObject({
      status: 'completed',
      scrapeStatus: 'scraped',
      brandLabel: 'Acme',
      websiteUrl: 'https://acme.example/products',
      summary: { name: 'Acme', description: 'Owner summary' },
    });
    expect(h.scraper.scrapeWebsiteWithEvidence).toHaveBeenCalledWith(
      'https://acme.example/products',
      expect.objectContaining({ deadlineAt: expect.any(Number) }),
    );
    expect(h.persistence.updateBrandWithScrapedData).toHaveBeenCalled();
    expect(h.harness.create).toHaveBeenCalled();
    for (const [where] of h.brands.findOne.mock.calls)
      expect(where).toMatchObject({
        organizationId: 'org-1',
        isDeleted: false,
      });
  });

  it('returns audience, offer and named-competitor suggestions from the voice analysis only', async () => {
    const h = createHarness();
    h.generator.analyzeBrandVoice.mockResolvedValue({
      audience: 'Gym owners, Personal trainers',
      audienceSegments: [
        'Gym owners',
        'Personal trainers',
        'Busy professionals',
        'Beginners 40+',
        'Athletes',
      ],
      competitors: ['Forge Fit'],
      offers: ['12-week coaching', 'Memberships'],
      taglines: [],
      tone: 'Direct',
      values: [],
      hashtags: [],
      voice: 'Encouraging',
    });
    const state = await h.service.scanBrandUrl(
      h.state.request,
      'https://acme.example',
    );
    expect(state.summary?.suggestions).toEqual({
      audiences: [
        'Gym owners',
        'Personal trainers',
        'Busy professionals',
        'Beginners 40+',
      ],
      offers: ['12-week coaching', 'Memberships'],
      competitors: ['Forge Fit'],
    });

    const empty = createHarness();
    const fallback = await empty.service.scanBrandUrl(
      empty.state.request,
      'https://acme.example',
    );
    expect(fallback.summary?.suggestions).toEqual({
      audiences: [],
      offers: [],
      competitors: [],
    });
  });

  it('renames a work-email domain label to the scanned company name', async () => {
    const h = createHarness();
    h.brands.findOne.mockResolvedValue({
      agentConfig: {},
      label: 'Genfeed',
      description: '',
      text: '',
    });
    const state = await h.service.scanBrandUrl(
      { ...h.state.request, email: 'onboarding@genfeed.ai' },
      'https://acme.com',
    );
    expect(state.brandLabel).toBe('Acme');
    expect(state.summary?.name).toBe('Acme');
    expect(h.persistence.updateBrandWithScrapedData).toHaveBeenCalledWith(
      'brand-1',
      expect.objectContaining({ companyName: 'Acme' }),
      { brandUrl: 'https://acme.com/' },
      'Acme',
    );
  });

  it.each([
    ['Chosen name', 'Genfeed', 'onboarding@genfeed.ai', 'Chosen name'],
    [undefined, 'Genfeed', 'onboarding@genfeed.ai', 'Genfeed'],
    [undefined, 'Default Organization', 'onboarding@genfeed.ai', 'Genfeed'],
    [
      undefined,
      'Default Organization',
      'onboarding@gmail.com',
      'Default Organization',
    ],
  ])(
    'keeps signup label rules for requested %s, current %s and email %s',
    async (brandName, label, email, expectedLabel) => {
      const h = createHarness();
      h.brands.findOne.mockResolvedValue({
        agentConfig: {},
        label,
        description: '',
        text: '',
      });
      const prepared = await h.service.preparePrefill({
        ...h.state.request,
        brandName,
        email,
      });
      const scraped = await h.service.scrapePrefill(prepared);
      expect(prepared.brandLabel).toBe(expectedLabel);
      expect(scraped.brandLabel).toBe(expectedLabel);
    },
  );

  it.each(['completed', 'skipped'] as const)(
    'bypasses a %s marker only for an explicit rescan',
    async (status) => {
      const h = createHarness();
      h.brands.findOne.mockResolvedValue({
        agentConfig: { signupPrefill: { status, hasHarnessProfile: true } },
        label: 'Default Organization',
        description: '',
        text: '',
      });
      const normal = await h.service.preparePrefill(h.state.request);
      expect(normal.status).toBe(status);
      await h.service.scrapePrefill(normal);
      expect(h.scraper.scrapeWebsite).not.toHaveBeenCalled();
      expect(h.brands.updateAgentConfig).not.toHaveBeenCalled();
      const scan = await h.service.scanBrandUrl(
        h.state.request,
        'https://acme.example',
      );
      expect(scan.brandLabel).toBe('Acme');
      expect(scan.scrapeStatus).toBe('scraped');
      expect(h.scraper.scrapeWebsiteWithEvidence).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    'https://linkedin.com/company/acme',
    'https://linktr.ee/acme',
    'http://acme.example/product?key=public-product#details',
  ])('accepts public profile/link/product URL %s', async (url) => {
    const h = createHarness();
    const state = await h.service.scanBrandUrl(h.state.request, url);
    expect(state.scrapeStatus).toBe('scraped');
    expect(state.websiteUrl).toBe(url.split('#')[0]);
  });

  it('uses the domain-derived label when the website has no name', async () => {
    const h = createHarness();
    h.brands.findOne.mockResolvedValue({
      agentConfig: {},
      label: 'Genfeed',
      description: '',
      text: '',
    });
    h.scraper.scrapeWebsiteWithEvidence.mockResolvedValue({
      data: { ...h.scrapedData, companyName: '' },
    });
    const state = await h.service.scanBrandUrl(
      {
        ...h.state.request,
        brandName: 'Previous name',
        email: 'onboarding@genfeed.ai',
      },
      'https://acme.com/product',
    );
    expect(state.brandLabel).toBe('Acme');
    expect(state.summary?.name).toBe('Acme');
  });

  it('reports scrape failure and does not analyze or persist fabricated data', async () => {
    const h = createHarness();
    h.scraper.scrapeWebsiteWithEvidence.mockRejectedValue(
      new Error('secret scraper error'),
    );
    const state = await h.service.scanBrandUrl(
      h.state.request,
      'https://acme.example',
    );
    expect(state).toMatchObject({
      status: 'failed',
      scrapeStatus: 'failed',
      scrapeReason: 'scrape_failed',
    });
    expect(h.generator.analyzeBrandVoice).not.toHaveBeenCalled();
    expect(h.persistence.updateBrandWithScrapedData).not.toHaveBeenCalled();
  });

  it('keeps signup fallback data best-effort and JSON-safe', async () => {
    const h = createHarness();
    h.scraper.scrapeWebsite.mockRejectedValue(new Error('offline'));
    let state = await h.service.scrapePrefill(h.state);
    expect(state).toMatchObject({
      status: 'running',
      scrapeStatus: 'failed',
      scrapeReason: 'scrape_failed',
    });
    expect(typeof state.scrapedData?.scrapedAt).toBe('string');
    state = await h.service.applyPrefillDefaults(state);
    expect(h.persistence.updateBrandWithScrapedData).toHaveBeenCalled();
    const result = await h.service.finalizePrefill(state);
    expect(result).toMatchObject({
      status: 'completed',
      scrapeStatus: 'failed',
    });
    expect(h.brands.updateAgentConfig).toHaveBeenLastCalledWith(
      'brand-1',
      'org-1',
      expect.objectContaining({
        signupPrefill: expect.objectContaining({
          status: 'completed',
          hasScrapedWebsite: true,
        }),
      }),
    );
    const action = getActionDefinition('signup.prefill.finalize');
    if (!action) throw new Error('Missing signup finalize contract');
    const contract = compileActionContract(action.id, {
      inputSchema: action.inputSchema as Readonly<Record<string, unknown>>,
      outputSchema: action.outputSchema as Readonly<Record<string, unknown>>,
    });
    expect(() => contract.validateOutput(result, provenance)).not.toThrow();
  });

  it('keeps personal-email signup best-effort without inventing a scrape', async () => {
    const h = createHarness();
    const state = await h.service.preparePrefill({
      ...h.state.request,
      email: 'owner@gmail.com',
    });
    expect(state.websiteUrl).toBeUndefined();
    expect(await h.service.scrapePrefill(state)).toEqual(state);
    const defaults = await h.service.applyPrefillDefaults(state);
    expect(await h.service.finalizePrefill(defaults)).toMatchObject({
      status: 'completed',
    });
    expect(h.scraper.scrapeWebsite).not.toHaveBeenCalled();
    expect(h.persistence.updateBrandWithScrapedData).not.toHaveBeenCalled();
  });

  it.each(['foreign organization', 'deleted'])(
    'rejects a %s brand at the scoped lookup',
    async () => {
      const h = createHarness();
      h.brands.findOne.mockResolvedValue(null);
      await expect(
        h.service.scanBrandUrl(h.state.request, 'https://acme.example'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(h.brands.findOne).toHaveBeenCalledWith(
        { id: 'brand-1', organizationId: 'org-1', isDeleted: false },
        'none',
      );
      expect(h.scraper.scrapeWebsiteWithEvidence).not.toHaveBeenCalled();
      expect(h.brands.updateAgentConfig).not.toHaveBeenCalled();
    },
  );

  it.each([
    'file:///etc/passwd',
    'ftp://acme.example',
    'http://localhost',
    'http://127.0.0.1',
    'http://10.0.0.1',
    'http://metadata.google.internal',
    '',
  ])(
    'rejects invalid/private URL %s and records failure without scraping',
    async (url) => {
      const h = createHarness();
      await expect(
        h.service.scanBrandUrl(h.state.request, url),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(h.brands.updateAgentConfig).toHaveBeenLastCalledWith(
        'brand-1',
        'org-1',
        expect.objectContaining({
          signupPrefill: expect.objectContaining({ status: 'failed' }),
        }),
      );
      expect(h.scraper.scrapeWebsiteWithEvidence).not.toHaveBeenCalled();
    },
  );

  it('rejects a hostname resolving to a private destination using the shared guard', async () => {
    const h = createHarness();
    vi.mocked(resolveSafeDestination).mockRejectedValueOnce(
      new Error('private destination'),
    );
    await expect(
      h.service.scanBrandUrl(h.state.request, 'https://acme.example'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(h.scraper.scrapeWebsiteWithEvidence).not.toHaveBeenCalled();
    expect(h.brands.updateAgentConfig).toHaveBeenLastCalledWith(
      'brand-1',
      'org-1',
      expect.objectContaining({
        signupPrefill: expect.objectContaining({ status: 'failed' }),
      }),
    );
  });

  it('times out within 45 seconds and blocks later stages when the scraper eventually settles', async () => {
    vi.useFakeTimers();
    const h = createHarness();
    let resolveScrape:
      | ((value: { data: typeof h.scrapedData }) => void)
      | undefined;
    h.scraper.scrapeWebsiteWithEvidence.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveScrape = resolve;
        }),
    );
    const scan = h.service.scanBrandUrl(
      h.state.request,
      'https://acme.example',
    );
    const rejection = expect(scan).rejects.toBeInstanceOf(
      RequestTimeoutException,
    );
    await vi.advanceTimersByTimeAsync(45_000);
    await rejection;
    expect(h.brands.updateAgentConfig).toHaveBeenLastCalledWith(
      'brand-1',
      'org-1',
      expect.objectContaining({
        signupPrefill: expect.objectContaining({ status: 'failed' }),
      }),
    );
    await expect(
      h.service.scanBrandUrl(h.state.request, 'https://acme.example'),
    ).rejects.toBeInstanceOf(ConflictException);
    resolveScrape?.({ data: h.scrapedData });
    await vi.advanceTimersByTimeAsync(1);
    expect(h.generator.analyzeBrandVoice).not.toHaveBeenCalled();
    expect(h.persistence.updateBrandWithScrapedData).not.toHaveBeenCalled();
    expect(h.harness.create).not.toHaveBeenCalled();
    expect(h.brands.updateAgentConfig).toHaveBeenLastCalledWith(
      'brand-1',
      'org-1',
      expect.objectContaining({
        signupPrefill: expect.objectContaining({ status: 'failed' }),
      }),
    );
  });
});
