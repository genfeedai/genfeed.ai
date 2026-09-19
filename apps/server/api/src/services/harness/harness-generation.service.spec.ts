import type { BrandOsRevisionsService } from '@api/collections/brands/services/brand-os-revisions.service';
import { KnowledgeSelectionService } from '@api/collections/contexts/services/knowledge-selection.service';
import { HarnessGenerationService } from '@api/services/harness/harness-generation.service';
import type { ContentHarnessBrief } from '@genfeedai/harness';
import { buildBrandKitDraftFromManualInput } from '@genfeedai/helpers';
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
  brandOsRevisionsService?: { findApproved: ReturnType<typeof vi.fn> };
  brandsService?: { findOne: ReturnType<typeof vi.fn> };
  contentHarnessService?: { composeBrief: ReturnType<typeof vi.fn> };
  contextsService?: { retrieveBrandContentMemory: ReturnType<typeof vi.fn> };
  harnessProfilesService?: {
    resolveContributionForBrand: ReturnType<typeof vi.fn>;
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
    resolveContributionForBrand: vi.fn().mockResolvedValue(null),
  };
  const contextsService = overrides?.contextsService ?? {
    retrieveBrandContentMemory: vi.fn().mockResolvedValue([]),
  };

  const brandOsRevisionsService = overrides?.brandOsRevisionsService ?? {
    findApproved: vi.fn().mockResolvedValue(null),
  };

  const service = new HarnessGenerationService(
    contentHarnessService as never,
    logger as never,
    brandsService as never,
    harnessProfilesService as never,
    contextsService as never,
    undefined,
    brandOsRevisionsService as unknown as BrandOsRevisionsService,
  );

  return {
    brandOsRevisionsService,
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

  describe('knowledge selection', () => {
    it('resolves the selection, constrains retrieval and raises the passage budget', async () => {
      const resolve = vi.fn().mockResolvedValue({
        knowledgePurposes: ['BRAND_TRUTH'],
        knowledgeSourceIds: ['source-1'],
      });
      const contextsService = {
        retrieveBrandContentMemory: vi.fn().mockResolvedValue([]),
      };
      const contentHarnessService = {
        composeBrief: vi.fn().mockResolvedValue(EMPTY_BRIEF),
      };
      const service = new HarnessGenerationService(
        contentHarnessService as never,
        { warn: vi.fn() } as never,
        { findOne: vi.fn().mockResolvedValue(BRAND) } as never,
        {
          resolveContributionForBrand: vi.fn().mockResolvedValue(null),
        } as never,
        contextsService as never,
        {
          get: vi.fn((token: unknown) =>
            token === KnowledgeSelectionService ? { resolve } : undefined,
          ),
        } as never,
      );

      await service.resolveBrief({
        brandId: 'brand-1',
        contentType: 'post',
        knowledgeSelection: { sourceIds: ['source-1'], spaceIds: ['space-1'] },
        organizationId: 'org-1',
        topic: 'pricing',
      });

      expect(resolve).toHaveBeenCalledWith('org-1', 'brand-1', {
        sourceIds: ['source-1'],
        spaceIds: ['space-1'],
      });
      expect(contextsService.retrieveBrandContentMemory).toHaveBeenCalledWith(
        expect.objectContaining({
          knowledgePurposes: ['BRAND_TRUTH'],
          knowledgeSourceIds: ['source-1'],
          limit: 8,
          query: 'pricing',
        }),
      );
    });
  });
});

describe('approved Brand OS identity', () => {
  it('uses approved identity while preserving knowledge and profile layers', async () => {
    const approved = {
      id: 'revision-2',
      content: buildBrandKitDraftFromManualInput(
        { id: 'brand-1' },
        {
          label: 'Approved name',
          voiceTone: 'Direct',
          primaryColor: '#112233',
          description: 'Approved positioning',
        },
      ),
    };
    for (const field of Object.values(approved.content.fields)) {
      if (field) {
        field.currentValue = field.proposedValue;
        delete field.proposedValue;
      }
    }
    const voiceTone = approved.content.fields.voiceTone;
    if (voiceTone) voiceTone.proposedValue = 'Unapproved candidate';
    const profile = {
      sources: [
        { id: 'example', content: 'Profile example', kind: 'brand_example' },
      ],
    };
    const { service, contentHarnessService, brandOsRevisionsService } =
      createService({
        brandOsRevisionsService: {
          findApproved: vi.fn().mockResolvedValue(approved),
        },
        brandsService: {
          findOne: vi.fn().mockResolvedValue({
            ...BRAND,
            agentConfig: {
              voice: { hashtags: ['#Legacy'], taglines: ['Legacy tagline'] },
              platformOverrides: {
                linkedin: { voice: { tone: 'Legacy override' } },
              },
            },
          }),
        },
        harnessProfilesService: {
          resolveContributionForBrand: vi.fn().mockResolvedValue({
            contribution: profile,
            profileId: 'profile-1',
          }),
        },
      });
    await service.resolveBrief({
      brandId: 'brand-1',
      organizationId: 'org-1',
      contentType: 'post',
      platform: 'linkedin',
    });
    expect(brandOsRevisionsService.findApproved).toHaveBeenCalledWith(
      'org-1',
      'brand-1',
    );
    expect(contentHarnessService.composeBrief).toHaveBeenCalledWith(
      expect.objectContaining({
        brandName: 'Approved name',
        brandOsRevisionId: 'revision-2',
        harnessProfileId: 'profile-1',
        voiceProfile: expect.objectContaining({ tone: 'Direct' }),
        profileContribution: profile,
        identityContribution: expect.objectContaining({
          systemDirectives: expect.arrayContaining([
            'Description: Approved positioning',
          ]),
          styleDirectives: expect.arrayContaining(['Primary color: #112233']),
        }),
      }),
    );
    const input = contentHarnessService.composeBrief.mock.calls[0][0];
    expect(input.voiceProfile.hashtags).toBeUndefined();
    expect(input.voiceProfile.taglines).toBeUndefined();
    expect(JSON.stringify(input)).not.toContain('Legacy override');
  });
  it('falls back to profile identity only when no approval exists', async () => {
    const { service, contentHarnessService } = createService();
    await service.resolveBrief({
      brandId: 'brand-1',
      organizationId: 'org-1',
      contentType: 'post',
    });
    expect(contentHarnessService.composeBrief).toHaveBeenCalledWith(
      expect.objectContaining({
        brandName: 'Test Brand',
        brandOsRevisionId: undefined,
        identityContribution: undefined,
      }),
    );
  });
  it('does not silently reconstruct identity after an approval lookup failure', async () => {
    const { service, contentHarnessService } = createService({
      brandOsRevisionsService: {
        findApproved: vi.fn().mockRejectedValue(new Error('unavailable')),
      },
    });
    expect(
      await service.resolveBrief({
        brandId: 'brand-1',
        organizationId: 'org-1',
        contentType: 'post',
      }),
    ).toBeNull();
    expect(contentHarnessService.composeBrief).not.toHaveBeenCalled();
  });
});
