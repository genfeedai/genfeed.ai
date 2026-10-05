import type { BrandDataMapper } from '@api/collections/brands/services/brand-data.mapper';
import type { BrandPersistenceService } from '@api/collections/brands/services/brand-persistence.service';
import type { BrandsService } from '@api/collections/brands/services/brands.service';
import type { HarnessProfilesService } from '@api/collections/harness-profiles/services/harness-profiles.service';
import type { BrandScraperService } from '@api/services/brand-scraper/brand-scraper.service';
import type { MasterPromptGeneratorService } from '@api/services/knowledge-base/master-prompt-generator.service';
import {
  SignupPrefillService,
  type SignupPrefillState,
} from '@api/services/signup-prefill/signup-prefill.service';
import { getActionDefinition } from '@genfeedai/actions';
import { compileActionContract } from '@genfeedai/workflows/engine';
import type { LoggerService } from '@libs/logger/logger.service';

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
  const scraper = { scrapeWebsite: vi.fn().mockResolvedValue(scrapedData) };
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
  const mapper = { readBrandAgentConfig: vi.fn().mockReturnValue({}) };
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
  const service = new SignupPrefillService(
    { warn: vi.fn() } as unknown as LoggerService,
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
  return { service, state, scrapedData, generator, persistence, harness };
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
