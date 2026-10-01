import type { BrandOsRevisionsService } from '@api/collections/brands/services/brand-os-revisions.service';
import { KnowledgeSelectionService } from '@api/collections/contexts/services/knowledge-selection.service';
import { hashBrandedGenerationTextV1 } from '@api/services/branded-generation-receipts/branded-generation-hash.util';
import { HarnessGenerationService } from '@api/services/harness/harness-generation.service';
import { SkillRuntimeService } from '@api/services/skill-runtime/skill-runtime.service';
import {
  brandedGenerationResolutionV1Schema,
  brandLearningApplicationV1Schema,
} from '@genfeedai/contracts/api-types/contracts/branded-generation.contract';
import {
  ContentLearningArm,
  ContentLearningMode,
  KnowledgeSourceKind,
  KnowledgeSourcePurpose,
} from '@genfeedai/contracts/enums';
import type {
  BrandedGenerationInputV1,
  BrandIdentitySnapshotV1,
  BrandLearningApplicationV1,
} from '@genfeedai/contracts/interfaces';
import type { ResolvedRuntimeSkill } from '@genfeedai/contracts/interfaces/ai';
import type { LearningGenerationReceipt } from '@genfeedai/contracts/interfaces/analytics/content-learning.interface';
import type { ContentHarnessBrief } from '@genfeedai/harness';
import { learningContribution } from '@genfeedai/harness';
import { buildBrandKitDraftFromManualInput } from '@genfeedai/helpers';
import { describe, expect, it, vi } from 'vitest';

const BRAND = {
  agentConfig: {},
  description: 'A test brand',
  id: 'brand-1',
  label: 'Test Brand',
};

const EMPTY_BRIEF: ContentHarnessBrief = {
  appliedPacks: [],
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
  knowledgeContentRetrievalService?: {
    retrieveBrandContentMemory: ReturnType<typeof vi.fn>;
  };
  harnessProfilesService?: {
    resolveContributionForBrand: ReturnType<typeof vi.fn>;
  };
}) {
  const contentHarnessService = overrides?.contentHarnessService ?? {
    composeBrief: vi.fn().mockResolvedValue(EMPTY_BRIEF),
  };
  const logger = { log: vi.fn(), warn: vi.fn() };
  const brandsService = overrides?.brandsService ?? {
    findOne: vi.fn().mockResolvedValue(BRAND),
  };
  const harnessProfilesService = overrides?.harnessProfilesService ?? {
    resolveContributionForBrand: vi.fn().mockResolvedValue(null),
  };
  const knowledgeContentRetrievalService =
    overrides?.knowledgeContentRetrievalService ?? {
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
    knowledgeContentRetrievalService as never,
    undefined,
    brandOsRevisionsService as unknown as BrandOsRevisionsService,
  );

  return {
    brandOsRevisionsService,
    brandsService,
    contentHarnessService,
    knowledgeContentRetrievalService,
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

  it('logs an operator receipt with the packs that contributed', async () => {
    const { service, logger } = createService({
      contentHarnessService: {
        composeBrief: vi.fn().mockResolvedValue({
          ...EMPTY_BRIEF,
          appliedPacks: ['core-baseline', 'acme-tone'],
          packs: ['core-baseline', 'platform-x', 'acme-tone'],
        }),
      },
    });

    await service.resolveBrief({
      brandId: 'brand-1',
      contentType: 'image',
      organizationId: 'org-1',
    });

    expect(logger.log).toHaveBeenCalledWith(
      'HarnessGenerationService applied content harness packs',
      {
        appliedPacks: ['core-baseline', 'acme-tone'],
        brandId: 'brand-1',
        contentType: 'image',
        organizationId: 'org-1',
      },
    );
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
    const { service, contentHarnessService, knowledgeContentRetrievalService } =
      createService({
        knowledgeContentRetrievalService: {
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

    expect(
      knowledgeContentRetrievalService.retrieveBrandContentMemory,
    ).toHaveBeenCalledWith(
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
      const { service, knowledgeContentRetrievalService } = createService();

      await service.resolveBrief({
        brandId: 'brand-1',
        contentType: 'post',
        organizationId: 'org-1',
      });

      expect(
        knowledgeContentRetrievalService.retrieveBrandContentMemory,
      ).not.toHaveBeenCalled();
    });

    it('retrieves brand content memory by default when a topic is present', async () => {
      const { service, knowledgeContentRetrievalService } = createService();

      await service.resolveBrief({
        brandId: 'brand-1',
        contentType: 'post',
        organizationId: 'org-1',
        topic: 'AI tools',
      });

      expect(
        knowledgeContentRetrievalService.retrieveBrandContentMemory,
      ).toHaveBeenCalled();
    });

    it('honors an explicit includeContentMemory: false even when a topic is present', async () => {
      const { service, knowledgeContentRetrievalService } = createService();

      await service.resolveBrief({
        brandId: 'brand-1',
        contentType: 'post',
        includeContentMemory: false,
        organizationId: 'org-1',
        topic: 'AI tools',
      });

      expect(
        knowledgeContentRetrievalService.retrieveBrandContentMemory,
      ).not.toHaveBeenCalled();
    });

    it('does not retrieve memory for an explicit includeContentMemory: true without a topic', async () => {
      const { service, knowledgeContentRetrievalService } = createService();

      await service.resolveBrief({
        brandId: 'brand-1',
        contentType: 'post',
        includeContentMemory: true,
        organizationId: 'org-1',
      });

      expect(
        knowledgeContentRetrievalService.retrieveBrandContentMemory,
      ).not.toHaveBeenCalled();
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
      const knowledgeContentRetrievalService = {
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
        knowledgeContentRetrievalService as never,
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
      expect(
        knowledgeContentRetrievalService.retrieveBrandContentMemory,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          knowledgePurposes: ['BRAND_TRUTH'],
          knowledgeSourceIds: ['source-1'],
          limit: 8,
          minRelevance: 0,
          query: 'pricing',
        }),
      );
    });

    it('keeps weakly similar passages of explicitly selected sources', async () => {
      const resolve = vi
        .fn()
        .mockResolvedValue({ knowledgeSourceIds: ['source-1'] });
      const contextsService = {
        retrieveBrandContentMemory: vi.fn().mockResolvedValue([
          {
            citation: {
              kind: 'TEXT',
              purpose: 'INSPIRATION',
              sourceId: 'source-1',
              title: 'Brand facts',
              version: 1,
              versionId: 'version-1',
            },
            content: 'We ship every Thursday.',
            relevance: 0.55,
          },
        ]),
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
        knowledgeSelection: { sourceIds: ['source-1'] },
        organizationId: 'org-1',
        topic: 'ship day',
      });

      const [{ sources }] = contentHarnessService.composeBrief.mock.calls[0];
      expect(sources).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ content: 'We ship every Thursday.' }),
        ]),
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

const hash = `sha256:${'a'.repeat(64)}`;
function snapshot(): BrandIdentitySnapshotV1 {
  return {
    schemaVersion: 1,
    organizationId: 'org',
    brandId: 'brand',
    revisionId: 'revision-a',
    revisionVersion: 1,
    approval: 'approved',
    resolvedAt: '2026-10-01T00:00:00.000Z',
    contentHash: hash,
    identity: {
      name: 'Historical A',
      description: 'Description',
      positioning: 'Position',
      language: 'en',
    },
    voice: {
      tone: 'Direct',
      style: 'Plain',
      audience: ['Founders'],
      values: ['Clarity'],
      messagingPillars: ['Useful'],
      avoid: [],
      sample: 'Sample',
    },
    generationRules: {
      schemaVersion: 1,
      evidence: [
        {
          id: 'e',
          sourceType: 'manual',
          label: 'Owner',
          sourceId: 'source',
          sourceVersion: 2,
          contentHash: hash,
        },
      ],
      facts: [],
      mandatory: [],
      avoid: [],
      palette: [],
      typography: [],
      assets: [],
      examples: [],
    },
    diagnostics: [],
  };
}
const learningTime = '2026-10-01T00:00:00.000Z';
function generationInput(): BrandedGenerationInputV1 {
  return {
    schemaVersion: 1,
    actorId: 'user',
    organizationId: 'org',
    brandId: 'brand',
    requestKey: 'request',
    candidateIndex: 0,
    surface: 'api',
    contentType: 'post',
    format: 'text',
    mode: 'approved_brand',
    originalPrompt: '  Request\r\nCafe\u0301 🎨  ',
    provider: 'fake',
    model: 'fake',
    generationParameters: {},
    knowledgeSourceIds: [],
    knowledgeSpaceIds: [],
  };
}
function baselineLearning(): BrandLearningApplicationV1 {
  return {
    schemaVersion: 1,
    brandFeedback: { status: 'not_applicable', sourceIds: [] },
    global: {
      status: 'not_applicable',
      scope: { format: 'text', objective: 'engagement' },
    },
    privateAccount: {
      mode: 'no_destination',
      configVersion: 'v1',
      synthetic: false,
      application: {
        status: 'unavailable',
        reasonCodes: ['no_destination'],
        privatePolicyApplied: false,
        sharedReleaseApplied: false,
        revalidatedAt: learningTime,
      },
    },
  };
}
function privateReceipt(): LearningGenerationReceipt {
  return {
    mode: ContentLearningMode.LIVE,
    configVersion: 'v1',
    synthetic: false,
    decisionId: 'decision',
    credentialId: 'credential',
    baselineId: 'baseline',
    opportunityId: 'opportunity',
    experimentId: 'experiment',
    accountRevision: 0,
    scopeRevision: 0,
    epoch: 0,
    armId: ContentLearningArm.QUESTION_EXAMPLE,
    selectedProbability: 1,
    probabilities: { 'question-example-v1': 1 },
    assignment: 'pilot',
    assignmentProbability: 0.1,
    executionProbability: 0.1,
    executionProbabilities: { 'question-example-v1': 0.1, 'baseline-v1': 0.9 },
    treatmentProbabilities: { 'question-example-v1': 1 },
    controlProbabilities: { 'baseline-v1': 1 },
    descriptorHash: 'a'.repeat(64),
    cellDescriptor: {
      platform: 'instagram',
      format: 'text',
      objective: 'engagement',
      exposureSource: 'impressions',
      metricWeights: [['likes', 1]],
      retention: false,
      windowId: '48h-v1',
      configVersion: 'rl-reward-v1-experimental',
      featureSchema: 'numeric-nine-v1',
      armCatalogVersion: 'learning-arms-v1',
    },
    application: {
      status: 'applied',
      reasonCodes: [],
      appliedArmId: ContentLearningArm.QUESTION_EXAMPLE,
      privatePolicyApplied: false,
      sharedReleaseApplied: false,
      revalidatedAt: learningTime,
    },
  };
}

function treatmentLearning(
  source: 'private' | 'global' | 'shared' = 'private',
): BrandLearningApplicationV1 {
  const learning = baselineLearning();
  if (source !== 'global') learning.privateAccount = privateReceipt();
  if (source !== 'private')
    learning.global = {
      status: 'applied',
      releaseId: 'release',
      releaseRevision: 2,
      policyId: 'shared-policy',
      policyVersion: 3,
      descriptorHash: 'a'.repeat(64),
      contributionHash: hash,
      brandPreferenceRevision: 0,
      stage: 'stable',
      scope: { platform: 'instagram', format: 'text', objective: 'engagement' },
      revalidatedAt: learningTime,
    };
  if (source === 'shared') {
    learning.privateAccount.sharedReleaseId = 'release';
    learning.privateAccount.sharedReleaseRevision = 2;
    learning.privateAccount.sharedPolicyId = 'shared-policy';
    if (learning.privateAccount.application)
      learning.privateAccount.application.sharedReleaseApplied = true;
  }
  return brandLearningApplicationV1Schema.parse(learning);
}

function snapshotService() {
  const profile = {
    resolveContributionForBrand: vi.fn().mockResolvedValue(null),
  };
  const packs = {
    composeBrief: vi.fn(),
    composeBriefLayers: vi.fn().mockResolvedValue([]),
  };
  const retrieval = {
    retrieveBrandContentMemory: vi.fn().mockResolvedValue([]),
  };
  const selection = {
    resolve: vi.fn().mockResolvedValue({ knowledgeSourceIds: ['source'] }),
  };
  const moduleRef = {
    get: vi.fn((token) =>
      token === KnowledgeSelectionService ? selection : undefined,
    ),
  };
  const brand = {
    findOne: vi.fn().mockResolvedValue({ ...BRAND, label: 'Live B' }),
  };
  const service = new HarnessGenerationService(
    packs as never,
    { log: vi.fn(), warn: vi.fn() } as never,
    brand as never,
    profile as never,
    retrieval as never,
    moduleRef as never,
  );
  const formatter = vi.fn(
    (skills: ResolvedRuntimeSkill[], _selected: string[] = []) =>
      skills.map((skill) => skill.instructions).join('\n'),
  );
  return {
    service,
    profile,
    packs,
    retrieval,
    selection,
    moduleRef,
    brand,
    formatter,
  };
}
function skill(slug = 'selected'): ResolvedRuntimeSkill {
  return {
    name: slug,
    slug,
    instructions: `Skill ${slug}`,
    toolOverrides: [],
    versionId: `version-${slug}`,
    contentHash: hash,
    source: 'custom',
  };
}
function hit(
  sourceId = 'source',
  versionId = 'knowledge-version',
  version = 1,
  content = 'Full cited passage',
) {
  return {
    content,
    relevance: 0.9,
    citation: {
      sourceId,
      versionId,
      version,
      title: 'Knowledge',
      kind: KnowledgeSourceKind.TEXT,
      purpose: KnowledgeSourcePurpose.RESEARCH,
    },
  };
}
describe('HarnessGenerationService#resolveSnapshotBrief', () => {
  it('consumes historical A without mutable Brand lookup and composes packs without duplicate profile or learning', async () => {
    const { service, packs, profile, brand, formatter } = snapshotService();
    profile.resolveContributionForBrand.mockResolvedValue({
      profileId: 'profile',
      contribution: { styleDirectives: ['Profile guidance'] },
    });
    packs.composeBriefLayers.mockResolvedValue([
      [{ id: 'pack', version: '1.2.3' }, { styleDirectives: ['Pack craft'] }],
    ]);
    const input = generationInput();
    input.objective = 'authority-proxy';
    input.platform = 'linkedin';
    const identity = snapshot();
    const before = structuredClone(identity);
    const result = await service.resolveSnapshotBrief(
      input,
      identity,
      [],
      [],
      formatter,
      baselineLearning(),
      {},
    );
    expect(result.status).toBe('resolved');
    expect(brand.findOne).not.toHaveBeenCalled();
    expect(packs.composeBrief).not.toHaveBeenCalled();
    expect(profile.resolveContributionForBrand).toHaveBeenCalledExactlyOnceWith(
      'org',
      'brand',
    );
    expect(packs.composeBriefLayers).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        brandName: 'Historical A',
        brandOsRevisionId: 'revision-a',
        intent: {
          contentType: 'post',
          objective: 'authority',
          topic: input.originalPrompt,
          platform: 'linkedin',
        },
        voiceProfile: {
          tone: 'Direct',
          style: 'Plain',
          audience: ['Founders'],
          values: ['Clarity'],
          messagingPillars: ['Useful'],
          doNotSoundLike: [],
          sampleOutput: 'Sample',
        },
      }),
    );
    const packInput = packs.composeBriefLayers.mock.calls[0][0];
    expect(packInput).not.toHaveProperty('profileContribution');
    expect(packInput).not.toHaveProperty('learningContribution');
    expect(result.learning.brandFeedback).toEqual({
      status: 'unavailable',
      reasonCode: 'profile_version_unavailable',
      profileId: 'profile',
      sourceIds: [],
    });
    expect(
      result.layers.find((layer) => layer.kind === 'harness_profile'),
    ).toMatchObject({
      id: 'profile',
      status: 'applied',
      contentHash: expect.stringMatching(/^sha256:/),
    });
    expect(
      result.diagnostics
        .filter((entry) => entry.code === 'brand.compatibility_unverified')
        .map((entry) => entry.message),
    ).toEqual([
      'Artifact validation is required for profile guidance.',
      'Artifact validation is required for pack guidance.',
    ]);
    expect(brandedGenerationResolutionV1Schema.parse(result)).toEqual(result);
    expect(identity).toEqual(before);
  });
  it.each(['scope', 'approval', 'missing', 'media'] as const)(
    'blocks %s before optional lookup',
    async (kind) => {
      const env = snapshotService();
      const input = generationInput();
      let identity: BrandIdentitySnapshotV1 | null = snapshot();
      let reason = 'identity_conflict';
      if (kind === 'scope') identity.organizationId = 'other-org';
      if (kind === 'approval') identity.approval = 'provisional';
      if (kind === 'missing') {
        identity = null;
        reason = 'no_approved_revision';
      }
      if (kind === 'media') {
        input.format = 'image';
        reason = 'unsupported_capability';
      }
      const result = await env.service.resolveSnapshotBrief(
        input,
        identity,
        [],
        [],
        env.formatter,
        baselineLearning(),
        {},
      );
      expect(result).toMatchObject({ status: 'blocked', reasonCode: reason });
      if (kind !== 'media') expect(result.snapshot).toBeNull();
      expect(env.profile.resolveContributionForBrand).not.toHaveBeenCalled();
      expect(env.packs.composeBriefLayers).not.toHaveBeenCalled();
      expect(env.retrieval.retrieveBrandContentMemory).not.toHaveBeenCalled();
    },
  );
  it('returns exact raw bytes without context calls and blocks explicit raw selection', async () => {
    const env = snapshotService();
    const input = generationInput();
    input.mode = 'raw';
    const result = await env.service.resolveSnapshotBrief(
      input,
      null,
      [skill()],
      [],
      env.formatter,
      baselineLearning(),
      {},
    );
    expect(result).toMatchObject({
      status: 'resolved',
      compiledPrompt: input.originalPrompt,
      originalPromptHash: hashBrandedGenerationTextV1(input.originalPrompt),
      snapshot: null,
    });
    input.knowledgeSourceIds = ['source'];
    const blocked = await env.service.resolveSnapshotBrief(
      input,
      null,
      [],
      [],
      env.formatter,
      baselineLearning(),
      {},
    );
    expect(blocked).toMatchObject({
      status: 'blocked',
      reasonCode: 'context_unavailable',
      snapshot: null,
    });
    expect(blocked.diagnostics.map((entry) => entry.code)).toEqual([
      'raw_mode_selection_conflict',
    ]);
    expect(env.formatter).not.toHaveBeenCalled();
    expect(env.profile.resolveContributionForBrand).not.toHaveBeenCalled();
    expect(env.packs.composeBriefLayers).not.toHaveBeenCalled();
  });
  it('suppresses supplied applied learning for a raw identity conflict without mutating history', async () => {
    const env = snapshotService();
    const input = generationInput();
    input.mode = 'raw';
    const learning = treatmentLearning();
    const before = structuredClone(learning);
    const result = await env.service.resolveSnapshotBrief(
      input,
      null,
      [],
      [],
      env.formatter,
      learning,
      learningContribution(ContentLearningArm.QUESTION_EXAMPLE),
    );
    expect(result).toMatchObject({
      status: 'blocked',
      reasonCode: 'identity_conflict',
      snapshot: null,
    });
    expect(result.learning.privateAccount.application).toMatchObject({
      status: 'suppressed',
      reasonCodes: ['identity_conflict'],
    });
    expect(learning).toEqual(before);
  });
  it('keeps explicit skills first in deduplicated requested order and auto skills separately attributed', async () => {
    const env = snapshotService();
    const result = await env.service.resolveSnapshotBrief(
      generationInput(),
      snapshot(),
      [skill('auto'), skill('second'), skill('first')],
      ['first', 'second', 'first'],
      env.formatter,
      baselineLearning(),
      {},
    );
    expect(
      env.formatter.mock.calls.map(([skills, selected]) => [
        skills[0].slug,
        selected,
      ]),
    ).toEqual([
      ['first', ['first']],
      ['second', ['second']],
      ['auto', ['auto']],
    ]);
    expect(
      result.layers
        .filter((layer) => layer.kind === 'skill')
        .map((layer) => [layer.id, layer.contentHash, layer.status]),
    ).toEqual([
      ['version-first', hash, 'applied'],
      ['version-second', hash, 'applied'],
      ['version-auto', hash, 'applied'],
    ]);
    if (result.status !== 'resolved') throw new Error('Expected resolution');
    expect(result.compiledPrompt.indexOf('Skill first')).toBeLessThan(
      result.compiledPrompt.indexOf('Skill second'),
    );
  });
  it.each([
    'missing',
    'version',
    'instructions',
    'formatter',
    'overflow',
  ] as const)('blocks explicit skill %s', async (kind) => {
    const env = snapshotService();
    const selected = skill();
    let skills = [selected];
    if (kind === 'missing') skills = [];
    if (kind === 'version') delete selected.versionId;
    if (kind === 'instructions') selected.instructions = '';
    if (kind === 'formatter')
      env.formatter.mockImplementation(() => {
        throw new Error('Private formatter details');
      });
    if (kind === 'overflow') selected.instructions = 'x'.repeat(6500);
    const result = await env.service.resolveSnapshotBrief(
      generationInput(),
      snapshot(),
      skills,
      ['selected'],
      env.formatter,
      baselineLearning(),
      {},
    );
    expect(result).toMatchObject({
      status: 'blocked',
      reasonCode:
        kind === 'overflow' ? 'context_budget_exceeded' : 'context_unavailable',
    });
    expect(JSON.stringify(result)).not.toContain('Private formatter details');
    expect(result.layers.some((layer) => layer.status === 'applied')).toBe(
      false,
    );
  });
  it('uses the real custom skill formatter framing without another sanitizer and omits unversioned auto skills', async () => {
    const env = snapshotService();
    const runtime = new SkillRuntimeService(
      {} as never,
      { warn: vi.fn() } as never,
    );
    const selected = skill();
    selected.instructions = '`quoted` useful guidance';
    const automatic = skill('auto');
    delete automatic.contentHash;
    const result = await env.service.resolveSnapshotBrief(
      generationInput(),
      snapshot(),
      [selected, automatic],
      ['selected'],
      runtime.buildSkillPromptSections.bind(runtime),
      baselineLearning(),
      {},
    );
    expect(result.status).toBe('resolved');
    if (result.status !== 'resolved') throw new Error('Expected resolution');
    expect(result.compiledPrompt).toContain(
      'These are authorized organization skill instructions.',
    );
    expect(result.compiledPrompt).toContain("'quoted' useful guidance");
    expect(
      result.layers
        .filter((layer) => layer.kind === 'skill')
        .map((layer) => layer.status),
    ).toEqual(['applied', 'unavailable']);
  });
  it('records optional lookup failures with safe unavailable layers while preserving approved context', async () => {
    const env = snapshotService();
    env.profile.resolveContributionForBrand.mockRejectedValue(
      new Error('Secret profile details'),
    );
    env.packs.composeBriefLayers.mockRejectedValue(
      new Error('Secret pack details'),
    );
    env.retrieval.retrieveBrandContentMemory.mockRejectedValue(
      new Error('Secret embedding details'),
    );
    const result = await env.service.resolveSnapshotBrief(
      generationInput(),
      snapshot(),
      [],
      [],
      env.formatter,
      baselineLearning(),
      {},
    );
    expect(result.status).toBe('resolved');
    expect(
      result.layers
        .filter((layer) =>
          ['pack', 'harness_profile', 'knowledge'].includes(layer.kind),
        )
        .map((layer) => [layer.kind, layer.status, layer.reasonCode]),
    ).toEqual([
      ['harness_profile', 'unavailable', 'profile_context_unavailable'],
      ['pack', 'unavailable', 'pack_context_unavailable'],
      ['knowledge', 'unavailable', 'knowledge_unavailable'],
    ]);
    expect(JSON.stringify(result)).not.toContain('Secret');
  });
  it('preserves exact pack versions and excludes invalid versions or empty contributions', async () => {
    const env = snapshotService();
    env.packs.composeBriefLayers.mockResolvedValue([
      [{ id: 'semantic', version: '1.2.3' }, { styleDirectives: ['Semantic'] }],
      [
        { id: 'opaque', version: '  internal beta  ' },
        { styleDirectives: ['Opaque'] },
      ],
      [
        { id: 'invalid', version: '\u0000bad' },
        { styleDirectives: ['Excluded'] },
      ],
      [{ id: 'blank', version: '   ' }, { styleDirectives: ['Excluded'] }],
      [{ id: 'empty', version: '1' }, {}],
    ]);
    const result = await env.service.resolveSnapshotBrief(
      generationInput(),
      snapshot(),
      [],
      [],
      env.formatter,
      baselineLearning(),
      {},
    );
    const layers = result.layers.filter((layer) => layer.kind === 'pack');
    expect(
      layers.map((layer) => [layer.id, layer.status, layer.version]),
    ).toEqual([
      ['semantic', 'applied', '1.2.3'],
      ['opaque', 'applied', '  internal beta  '],
      ['invalid', 'unavailable', undefined],
      ['blank', 'unavailable', undefined],
      ['empty', 'not_applicable', '1'],
    ]);
    expect(layers[2].reasonCode).toBe('pack_version_invalid');
  });
  it('expands each selected space once, unions sources stably, retrieves once, and retains full long passages', async () => {
    const env = snapshotService();
    const input = generationInput();
    input.knowledgeSourceIds = ['direct'];
    input.knowledgeSpaceIds = ['space-a', 'space-b'];
    env.selection.resolve
      .mockResolvedValueOnce({ knowledgeSourceIds: ['space-source', 'direct'] })
      .mockResolvedValueOnce({ knowledgeSourceIds: ['second'] });
    env.retrieval.retrieveBrandContentMemory.mockResolvedValue([
      hit('direct', 'v-direct', 1, 'p'.repeat(700)),
      hit('space-source', 'v-space'),
      hit('second', 'v-second'),
    ]);
    const result = await env.service.resolveSnapshotBrief(
      input,
      snapshot(),
      [],
      [],
      env.formatter,
      baselineLearning(),
      {},
    );
    expect(result.status).toBe('resolved');
    expect(env.selection.resolve.mock.calls).toEqual([
      ['org', 'brand', { spaceIds: ['space-a'] }],
      ['org', 'brand', { spaceIds: ['space-b'] }],
    ]);
    expect(
      env.retrieval.retrieveBrandContentMemory,
    ).toHaveBeenCalledExactlyOnceWith({
      organizationId: 'org',
      brandId: 'brand',
      query: input.originalPrompt,
      limit: 8,
      minRelevance: 0,
      knowledgeSourceIds: ['direct', 'space-source', 'second'],
      isKnowledgeOnly: true,
    });
    if (result.status !== 'resolved') throw new Error('Expected resolution');
    expect(result.compiledPrompt).toContain('p'.repeat(700));
    expect(
      result.layers
        .filter((layer) => layer.kind === 'knowledge')
        .map((layer) => [layer.id, layer.status, layer.evidenceIds]),
    ).toEqual([
      ['v-direct', 'applied', []],
      ['v-space', 'applied', []],
      ['v-second', 'applied', []],
    ]);
  });
  it.each([
    'dependency',
    'empty-space',
    'over-limit',
    'empty-result',
    'missing-source',
    'unselected',
    'uncited',
    'version',
    'conflicting-version',
    'conflicting-counter',
    'source-id',
    'blank-query',
    'retrieval',
    'overflow',
    'altered',
  ] as const)(
    'blocks explicit Knowledge %s without widened retrieval or partial source application',
    async (kind) => {
      const env = snapshotService();
      const input = generationInput();
      input.knowledgeSourceIds = ['source'];
      env.retrieval.retrieveBrandContentMemory.mockResolvedValue([hit()]);
      if (kind === 'dependency') env.moduleRef.get.mockReturnValue(undefined);
      if (kind === 'empty-space') {
        input.knowledgeSpaceIds = ['space'];
        env.selection.resolve.mockResolvedValue({ knowledgeSourceIds: [] });
      }
      if (kind === 'over-limit')
        input.knowledgeSourceIds = Array.from(
          { length: 9 },
          (_, index) => `source-${index}`,
        );
      if (kind === 'empty-result')
        env.retrieval.retrieveBrandContentMemory.mockResolvedValue([]);
      if (kind === 'missing-source') input.knowledgeSourceIds.push('missing');
      if (kind === 'unselected')
        env.retrieval.retrieveBrandContentMemory.mockResolvedValue([
          hit('other'),
        ]);
      if (kind === 'uncited')
        env.retrieval.retrieveBrandContentMemory.mockResolvedValue([
          { content: 'Legacy', relevance: 0.9 },
        ]);
      if (kind === 'version')
        env.retrieval.retrieveBrandContentMemory.mockResolvedValue([
          hit('source', 'version', 0),
        ]);
      if (kind === 'conflicting-version')
        env.retrieval.retrieveBrandContentMemory.mockResolvedValue([
          hit(),
          hit('source', 'other-version'),
        ]);
      if (kind === 'conflicting-counter')
        env.retrieval.retrieveBrandContentMemory.mockResolvedValue([
          hit(),
          hit('source', 'knowledge-version', 2),
        ]);
      if (kind === 'source-id')
        env.retrieval.retrieveBrandContentMemory.mockResolvedValue([
          hit('bad\u0000id'),
        ]);
      if (kind === 'blank-query') input.originalPrompt = ' ';
      if (kind === 'retrieval')
        env.retrieval.retrieveBrandContentMemory.mockRejectedValue(
          new Error('Embedding failed'),
        );
      if (kind === 'overflow')
        env.retrieval.retrieveBrandContentMemory.mockResolvedValue([
          hit('source', 'v', 1, 'x'.repeat(6500)),
        ]);
      if (kind === 'altered')
        env.retrieval.retrieveBrandContentMemory.mockResolvedValue([
          hit('source', 'v', 1, '`required literal`'),
        ]);
      const result = await env.service.resolveSnapshotBrief(
        input,
        snapshot(),
        [],
        [],
        env.formatter,
        baselineLearning(),
        {},
      );
      expect(result).toMatchObject({
        status: 'blocked',
        reasonCode:
          kind === 'overflow'
            ? 'context_budget_exceeded'
            : kind === 'altered'
              ? 'context_unavailable'
              : 'knowledge_unavailable',
      });
      expect(result.layers.some((layer) => layer.status === 'applied')).toBe(
        false,
      );
      expect(
        env.retrieval.retrieveBrandContentMemory.mock.calls.length,
      ).toBeLessThanOrEqual(1);
      if (kind === 'altered')
        expect(
          result.diagnostics.some(
            (entry) => entry.code === 'required_context_altered',
          ),
        ).toBe(true);
    },
  );
  it('excludes uncited or invalid optional memory with honest unavailable attribution', async () => {
    const env = snapshotService();
    env.retrieval.retrieveBrandContentMemory.mockResolvedValue([
      { content: 'Legacy', relevance: 0.9 },
      hit('bad\u0000id'),
    ]);
    const result = await env.service.resolveSnapshotBrief(
      generationInput(),
      snapshot(),
      [],
      [],
      env.formatter,
      baselineLearning(),
      {},
    );
    expect(result.status).toBe('resolved');
    expect(
      result.layers.find((layer) => layer.kind === 'knowledge'),
    ).toMatchObject({
      status: 'unavailable',
      reasonCode: 'knowledge_unavailable',
    });
  });
  it('propagates malformed canonical input, snapshot and learning before context lookups', async () => {
    const env = snapshotService();
    for (const [input, identity, learning] of [
      [
        { ...generationInput(), schemaVersion: 2 },
        snapshot(),
        baselineLearning(),
      ],
      [
        generationInput(),
        { ...snapshot(), revisionVersion: 0 },
        baselineLearning(),
      ],
      [
        generationInput(),
        snapshot(),
        { ...baselineLearning(), schemaVersion: 2 },
      ],
    ]) {
      await expect(
        env.service.resolveSnapshotBrief(
          input as never,
          identity as never,
          [],
          [],
          env.formatter,
          learning as never,
          {},
        ),
      ).rejects.toHaveProperty('name', 'ZodError');
    }
    expect(env.profile.resolveContributionForBrand).not.toHaveBeenCalled();
  });
});

describe('snapshot source boundary regressions', () => {
  it('blocks missing immutable Knowledge version IDs instead of accepting optional layer identity', async () => {
    const env = snapshotService();
    const input = generationInput();
    input.knowledgeSourceIds = ['source'];
    const passage = hit();
    delete (passage.citation as Partial<typeof passage.citation>).versionId;
    env.retrieval.retrieveBrandContentMemory.mockResolvedValue([passage]);
    expect(
      await env.service.resolveSnapshotBrief(
        input,
        snapshot(),
        [],
        [],
        env.formatter,
        baselineLearning(),
        {},
      ),
    ).toMatchObject({ status: 'blocked', reasonCode: 'knowledge_unavailable' });
  });
  it('protects supplied snapshot arrays from pack-side mutation while preserving pack input values', async () => {
    const env = snapshotService();
    const identity = snapshot();
    env.packs.composeBriefLayers.mockImplementation(async (packInput) => {
      packInput.voiceProfile.audience.push('Forged');
      return [];
    });
    const result = await env.service.resolveSnapshotBrief(
      generationInput(),
      identity,
      [],
      [],
      env.formatter,
      baselineLearning(),
      {},
    );
    expect(result.snapshot?.voice.audience).toEqual(['Founders']);
    expect(identity.voice.audience).toEqual(['Founders']);
  });
  it('propagates bad actual pack IDs as canonical input failures without invented replacement IDs', async () => {
    const env = snapshotService();
    env.packs.composeBriefLayers.mockResolvedValue([
      [{ id: undefined, version: '1' }, {}],
    ]);
    await expect(
      env.service.resolveSnapshotBrief(
        generationInput(),
        snapshot(),
        [],
        [],
        env.formatter,
        baselineLearning(),
        {},
      ),
    ).rejects.toHaveProperty('name', 'ZodError');
  });
});
