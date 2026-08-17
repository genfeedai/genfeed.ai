import { HarnessGenerationService } from '@api/services/harness/harness-generation.service';
import type { ContentHarnessBrief } from '@genfeedai/harness';
import { describe, expect, it, vi } from 'vitest';

const BRAND = {
  agentConfig: {},
  description: 'A test brand',
  id: 'brand-1',
  label: 'Test Brand',
};

const EMPTY_BRIEF: ContentHarnessBrief = {
  evaluationCriteria: [],
  guardrails: [],
  metadata: {
    contentType: 'post',
    objective: 'engagement',
  },
  packs: [],
  providerHints: [],
  sources: [],
  styleDirectives: [],
  systemDirectives: [],
};

function createService(overrides?: {
  brandsService?: { findOne: ReturnType<typeof vi.fn> };
  contentHarnessService?: { composeBrief: ReturnType<typeof vi.fn> };
  contextsService?: { retrieveBrandContentMemory: ReturnType<typeof vi.fn> };
  harnessProfilesService?: {
    buildContributionForBrand: ReturnType<typeof vi.fn>;
  };
}) {
  const contentHarnessService = overrides?.contentHarnessService ?? {
    composeBrief: vi.fn().mockResolvedValue(EMPTY_BRIEF),
  };
  const logger = { warn: vi.fn() };
  const brandsService = overrides?.brandsService ?? {
    findOne: vi.fn().mockResolvedValue(BRAND),
  };
  const harnessProfilesService = overrides?.harnessProfilesService ?? {
    buildContributionForBrand: vi.fn().mockResolvedValue(undefined),
  };
  const contextsService = overrides?.contextsService ?? {
    retrieveBrandContentMemory: vi.fn().mockResolvedValue([]),
  };

  const service = new HarnessGenerationService(
    contentHarnessService as never,
    logger as never,
    brandsService as never,
    harnessProfilesService as never,
    contextsService as never,
    undefined,
  );

  return {
    brandsService,
    contentHarnessService,
    contextsService,
    harnessProfilesService,
    logger,
    service,
  };
}

describe('HarnessGenerationService#resolveBrief', () => {
  it('returns null when brandId is missing', async () => {
    const { service, contentHarnessService } = createService();

    const brief = await service.resolveBrief({
      contentType: 'post',
      organizationId: 'org-1',
    });

    expect(brief).toBeNull();
    expect(contentHarnessService.composeBrief).not.toHaveBeenCalled();
  });

  it('returns null when the brand cannot be found', async () => {
    const { service } = createService({
      brandsService: { findOne: vi.fn().mockResolvedValue(null) },
    });

    const brief = await service.resolveBrief({
      brandId: 'brand-1',
      contentType: 'post',
      organizationId: 'org-1',
    });

    expect(brief).toBeNull();
  });

  it('passes the persona through to composeBrief (parity with the old direct-call path)', async () => {
    const { service, contentHarnessService } = createService();
    const persona = {
      bio: 'Founder voice',
      handle: 'founder',
      label: 'Founder Persona',
    };

    await service.resolveBrief({
      brandId: 'brand-1',
      contentType: 'post',
      organizationId: 'org-1',
      persona,
      topic: 'Product launch',
    });

    expect(contentHarnessService.composeBrief).toHaveBeenCalledWith(
      expect.objectContaining({
        personaProfile: expect.objectContaining({
          bio: 'Founder voice',
          label: 'Founder Persona',
        }),
      }),
    );
  });

  it('merges caller-supplied additionalSources ahead of retrieved brand content memory', async () => {
    const { service, contentHarnessService, contextsService } = createService({
      contextsService: {
        retrieveBrandContentMemory: vi.fn().mockResolvedValue([
          {
            content: 'A top-performing winner post',
            id: 'memory-1',
            relevance: 0.9,
            source: 'library',
          },
        ]),
      },
    });

    await service.resolveBrief({
      additionalSources: [
        {
          content: 'Caller-supplied audience signal',
          id: 'caller-1',
          kind: 'audience_signal',
        },
      ],
      brandId: 'brand-1',
      contentType: 'post',
      organizationId: 'org-1',
      topic: 'Product launch',
    });

    expect(contextsService.retrieveBrandContentMemory).toHaveBeenCalledWith(
      expect.objectContaining({
        brandId: 'brand-1',
        limit: 5,
        minRelevance: 0.65,
        organizationId: 'org-1',
        query: 'Product launch',
      }),
    );

    const composedInput = contentHarnessService.composeBrief.mock.calls[0][0];
    expect(composedInput.sources).toHaveLength(2);
    expect(composedInput.sources[0].id).toBe('caller-1');
  });

  describe('topic gate (includeContentMemory ?? Boolean(topic?.trim()))', () => {
    it('skips brand content memory retrieval when no topic and includeContentMemory is unset', async () => {
      const { service, contextsService } = createService();

      await service.resolveBrief({
        brandId: 'brand-1',
        contentType: 'post',
        organizationId: 'org-1',
      });

      expect(contextsService.retrieveBrandContentMemory).not.toHaveBeenCalled();
    });

    it('retrieves brand content memory by default when a topic is present', async () => {
      const { service, contextsService } = createService();

      await service.resolveBrief({
        brandId: 'brand-1',
        contentType: 'post',
        organizationId: 'org-1',
        topic: 'AI tools',
      });

      expect(contextsService.retrieveBrandContentMemory).toHaveBeenCalled();
    });

    it('honors an explicit includeContentMemory: false even when a topic is present', async () => {
      const { service, contextsService } = createService();

      await service.resolveBrief({
        brandId: 'brand-1',
        contentType: 'post',
        includeContentMemory: false,
        organizationId: 'org-1',
        topic: 'AI tools',
      });

      expect(contextsService.retrieveBrandContentMemory).not.toHaveBeenCalled();
    });

    it('does not retrieve memory for an explicit includeContentMemory: true without a topic', async () => {
      const { service, contextsService } = createService();

      await service.resolveBrief({
        brandId: 'brand-1',
        contentType: 'post',
        includeContentMemory: true,
        organizationId: 'org-1',
      });

      expect(contextsService.retrieveBrandContentMemory).not.toHaveBeenCalled();
    });
  });

  it('returns null and logs a warning when brand lookup throws', async () => {
    const { service, logger } = createService({
      brandsService: {
        findOne: vi.fn().mockRejectedValue(new Error('db unavailable')),
      },
    });

    const brief = await service.resolveBrief({
      brandId: 'brand-1',
      contentType: 'post',
      organizationId: 'org-1',
    });

    expect(brief).toBeNull();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('failed to resolve harness brief'),
      expect.objectContaining({ brandId: 'brand-1', organizationId: 'org-1' }),
    );
  });
});
