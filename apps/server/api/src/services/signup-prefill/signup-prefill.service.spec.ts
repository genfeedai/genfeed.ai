import type { BrandDataMapper } from '@api/collections/brands/services/brand-data.mapper';
import type { BrandPersistenceService } from '@api/collections/brands/services/brand-persistence.service';
import type { BrandsService } from '@api/collections/brands/services/brands.service';
import type { HarnessProfilesService } from '@api/collections/harness-profiles/services/harness-profiles.service';
import type { BrandScraperService } from '@api/services/brand-scraper/brand-scraper.service';
import type { MasterPromptGeneratorService } from '@api/services/knowledge-base/master-prompt-generator.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SignupPrefillService } from './signup-prefill.service';

const JOB = {
  brandId: 'b_1',
  email: 'vincent@acme.com',
  organizationId: 'o_1',
  userId: 'u_1',
};

describe('SignupPrefillService', () => {
  let brandsService: {
    findOne: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
  };
  let brandScraperService: { scrapeWebsite: ReturnType<typeof vi.fn> };
  let brandDataMapper: {
    buildFallbackScrapedData: ReturnType<typeof vi.fn>;
    readBrandAgentConfig: ReturnType<typeof vi.fn>;
  };
  let brandPersistenceService: Record<string, ReturnType<typeof vi.fn>>;
  let masterPromptGeneratorService: {
    analyzeBrandVoice: ReturnType<typeof vi.fn>;
  };
  let harnessProfilesService: {
    create: ReturnType<typeof vi.fn>;
    findForBrand: ReturnType<typeof vi.fn>;
  };
  let logger: {
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };
  let service: SignupPrefillService;

  function buildService(): SignupPrefillService {
    return new SignupPrefillService(
      logger as unknown as LoggerService,
      brandsService as unknown as BrandsService,
      brandScraperService as unknown as BrandScraperService,
      brandDataMapper as unknown as BrandDataMapper,
      brandPersistenceService as unknown as BrandPersistenceService,
      masterPromptGeneratorService as unknown as MasterPromptGeneratorService,
      harnessProfilesService as unknown as HarnessProfilesService,
    );
  }

  beforeEach(() => {
    brandsService = {
      findOne: vi
        .fn()
        .mockResolvedValue({ agentConfig: {}, label: 'Default Organization' }),
      patch: vi.fn().mockResolvedValue(undefined),
    };
    brandScraperService = {
      scrapeWebsite: vi.fn().mockResolvedValue({
        companyName: 'Acme',
        description: 'Automation for operators.',
        scrapedAt: new Date('2026-01-01T00:00:00.000Z'),
        socialLinks: { linkedin: 'https://linkedin.com/company/acme' },
        sourceUrl: 'https://acme.com',
      }),
    };
    brandDataMapper = {
      buildFallbackScrapedData: vi.fn().mockReturnValue({
        companyName: 'Acme',
        scrapedAt: new Date('2026-01-01T00:00:00.000Z'),
        sourceUrl: 'https://acme.com',
      }),
      readBrandAgentConfig: vi.fn((value: unknown) => value ?? {}),
    };
    brandPersistenceService = {
      importScrapedBrandBanner: vi.fn().mockResolvedValue(undefined),
      syncBrandAndOrgSlug: vi.fn().mockResolvedValue(undefined),
      updateBrandGuidance: vi.fn().mockResolvedValue(undefined),
      updateBrandWithScrapedData: vi.fn().mockResolvedValue(undefined),
      upsertBrandSocialLinks: vi.fn().mockResolvedValue(undefined),
      upsertBrandWebsiteLink: vi.fn().mockResolvedValue(undefined),
    };
    masterPromptGeneratorService = {
      analyzeBrandVoice: vi.fn().mockResolvedValue({
        audience: 'founders',
        tone: 'direct',
        values: ['craft'],
        voice: 'plain',
      }),
    };
    harnessProfilesService = {
      create: vi.fn().mockResolvedValue({ id: 'p_1' }),
      findForBrand: vi.fn().mockResolvedValue([]),
    };
    logger = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };
    service = buildService();
  });

  it('scrapes the corporate domain behind the signup email', async () => {
    const result = await service.prefillBrand(JOB);

    expect(brandScraperService.scrapeWebsite).toHaveBeenCalledWith(
      'https://acme.com',
    );
    expect(result.brandDomain).toBe('acme.com');
    expect(result.status).toBe('completed');
  });

  it('persists links, banner, guidance and slug from the scrape', async () => {
    await service.prefillBrand(JOB);

    expect(
      brandPersistenceService.updateBrandWithScrapedData,
    ).toHaveBeenCalled();
    expect(brandPersistenceService.upsertBrandWebsiteLink).toHaveBeenCalledWith(
      'b_1',
      'https://acme.com',
    );
    expect(brandPersistenceService.upsertBrandSocialLinks).toHaveBeenCalled();
    expect(brandPersistenceService.importScrapedBrandBanner).toHaveBeenCalled();
    expect(brandPersistenceService.updateBrandGuidance).toHaveBeenCalled();
    expect(brandPersistenceService.syncBrandAndOrgSlug).toHaveBeenCalledWith(
      'Acme',
      'o_1',
      'b_1',
    );
  });

  it('meters the brand-voice analysis against the signup organization', async () => {
    await service.prefillBrand(JOB);

    expect(masterPromptGeneratorService.analyzeBrandVoice).toHaveBeenCalledWith(
      expect.anything(),
      { organizationId: 'o_1', userId: 'u_1' },
    );
  });

  it('seeds a default harness profile', async () => {
    const result = await service.prefillBrand(JOB);

    expect(harnessProfilesService.create).toHaveBeenCalledWith(
      expect.objectContaining({ brandId: 'b_1', scope: 'brand' }),
      'o_1',
      'u_1',
    );
    expect(result.hasHarnessProfile).toBe(true);
  });

  it('writes a pre-prompt when the brand has none', async () => {
    await service.prefillBrand(JOB);

    expect(brandsService.patch).toHaveBeenCalledWith(
      'b_1',
      expect.objectContaining({
        text: expect.stringContaining('You are creating content for Acme.'),
      }),
    );
  });

  it('replaces the provisioning placeholder description', async () => {
    brandsService.findOne.mockResolvedValue({
      agentConfig: {},
      description: 'Default description. Use it as a pre-prompt',
      label: 'Default Organization',
    });

    await service.prefillBrand(JOB);

    expect(brandsService.patch).toHaveBeenCalledWith(
      'b_1',
      expect.objectContaining({ description: 'Automation for operators.' }),
    );
  });

  it('leaves a pre-prompt and description the user already wrote', async () => {
    brandsService.findOne.mockResolvedValue({
      agentConfig: {},
      description: 'We write for operators.',
      label: 'Vincent Studio',
      text: 'Always open with a customer story.',
    });

    await service.prefillBrand(JOB);

    const promptPatches = brandsService.patch.mock.calls.filter(
      ([, update]: [string, Record<string, unknown>]) =>
        'text' in update || 'description' in update,
    );
    expect(promptPatches).toHaveLength(0);
  });

  it('does not scrape a personal email domain', async () => {
    const result = await service.prefillBrand({
      ...JOB,
      email: 'vincent@gmail.com',
    });

    expect(brandScraperService.scrapeWebsite).not.toHaveBeenCalled();
    expect(result.brandDomain).toBeNull();
    expect(result.status).toBe('completed');
    // Defaults and the harness still land — the brand is usable either way.
    expect(harnessProfilesService.create).toHaveBeenCalled();
  });

  it('prefers an explicitly requested domain over the email domain', async () => {
    await service.prefillBrand({
      ...JOB,
      brandDomain: 'https://other.io/team',
    });

    expect(brandScraperService.scrapeWebsite).toHaveBeenCalledWith(
      'https://other.io',
    );
  });

  it('falls back to minimal brand data when the scrape fails', async () => {
    brandScraperService.scrapeWebsite.mockRejectedValue(new Error('timeout'));

    const result = await service.prefillBrand(JOB);

    expect(brandDataMapper.buildFallbackScrapedData).toHaveBeenCalled();
    expect(result.status).toBe('completed');
    expect(logger.warn).toHaveBeenCalled();
  });

  it('keeps the scraped brand when the voice analysis fails', async () => {
    masterPromptGeneratorService.analyzeBrandVoice.mockRejectedValue(
      new Error('llm down'),
    );

    const result = await service.prefillBrand(JOB);

    expect(result.hasBrandVoice).toBe(false);
    expect(
      brandPersistenceService.updateBrandWithScrapedData,
    ).toHaveBeenCalled();
  });

  it('is idempotent — a retry after completion does no work', async () => {
    brandsService.findOne.mockResolvedValue({
      agentConfig: {
        signupPrefill: { brandDomain: 'acme.com', status: 'completed' },
      },
      label: 'Acme',
    });

    const result = await service.prefillBrand(JOB);

    expect(result.status).toBe('completed');
    expect(brandScraperService.scrapeWebsite).not.toHaveBeenCalled();
    expect(harnessProfilesService.create).not.toHaveBeenCalled();
    expect(brandsService.patch).not.toHaveBeenCalled();
  });

  it('skips a brand that no longer exists', async () => {
    brandsService.findOne.mockResolvedValue(null);

    const result = await service.prefillBrand(JOB);

    expect(result.status).toBe('skipped');
    expect(brandsService.patch).not.toHaveBeenCalled();
  });

  it('never overwrites a brand name the user already chose', async () => {
    brandsService.findOne.mockResolvedValue({
      agentConfig: {},
      label: 'Vincent Studio',
    });

    await service.prefillBrand(JOB);

    expect(brandPersistenceService.syncBrandAndOrgSlug).toHaveBeenCalledWith(
      'Vincent Studio',
      'o_1',
      'b_1',
    );
  });

  it('does not duplicate an existing harness profile', async () => {
    harnessProfilesService.findForBrand.mockResolvedValue([{ id: 'p_0' }]);

    const result = await service.prefillBrand(JOB);

    expect(harnessProfilesService.create).not.toHaveBeenCalled();
    expect(result.hasHarnessProfile).toBe(true);
  });

  it('records a terminal failure marker for the onboarding UI', async () => {
    await service.markPrefillFailed('b_1');

    expect(brandsService.patch).toHaveBeenCalledWith('b_1', {
      agentConfig: expect.objectContaining({
        signupPrefill: expect.objectContaining({ status: 'failed' }),
      }),
    });
  });
});
