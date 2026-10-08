import type { BrandOsRevisionsService } from '@api/collections/brands/services/brand-os-revisions.service';
import { KnowledgeSelectionService } from '@api/collections/contexts/services/knowledge-selection.service';
import { fitRequiredBrandContextToBudgetWithReport } from '@api/services/agent-context-assembly/brand-context-budget.util';
import { hashBrandedGenerationTextV1 } from '@api/services/branded-generation-receipts/branded-generation-hash.util';
import {
  compileSnapshotBriefResolution,
  projectBrandSnapshotContributions,
} from '@api/services/harness/branded-generation-compiler';
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
import {
  brandAccessFixture,
  snapshotInitiatingActor,
} from '@test/helpers/brand-access.fixture';
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
    brandAccessFixture(),
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
      userId: 'fixture-user',
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
      userId: 'fixture-user',
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
      userId: 'fixture-user',
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

  it('composes only the requested surface and defaults to every pack', async () => {
    const { contentHarnessService, service } = createService();

    await service.resolveBrief({
      userId: 'fixture-user',
      brandId: 'brand-1',
      contentType: 'video',
      organizationId: 'org-1',
      surface: 'media',
    });
    await service.resolveBrief({
      userId: 'fixture-user',
      brandId: 'brand-1',
      contentType: 'post',
      organizationId: 'org-1',
    });

    expect(contentHarnessService.composeBrief.mock.calls[0][1]).toEqual({
      surface: 'media',
    });
    expect(contentHarnessService.composeBrief.mock.calls[1][1]).toBeUndefined();
  });

  it('passes the persona through to composeBrief (parity with the old direct-call path)', async () => {
    const { service, contentHarnessService } = createService();
    const persona = {
      bio: 'Founder voice',
      handle: 'founder',
      label: 'Founder Persona',
    };

    await service.resolveBrief({
      userId: 'fixture-user',
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
      userId: 'fixture-user',
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
        userId: 'fixture-user',
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
        userId: 'fixture-user',
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
        userId: 'fixture-user',
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
        userId: 'fixture-user',
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
      userId: 'fixture-user',
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
        brandAccessFixture(),
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
        userId: 'fixture-user',
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
        brandAccessFixture(),
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
        userId: 'fixture-user',
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
      userId: 'fixture-user',
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
      userId: 'fixture-user',
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
        userId: 'fixture-user',
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
    retrieveSelectedBrandContentMemory: vi.fn().mockResolvedValue([]),
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
    brandAccessFixture(),
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
      snapshotInitiatingActor(input),
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
        snapshotInitiatingActor(input),
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
      snapshotInitiatingActor(input),
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
      snapshotInitiatingActor(input),
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
      snapshotInitiatingActor(input),
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
      snapshotInitiatingActor(generationInput()),
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
      snapshotInitiatingActor(generationInput()),
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
      snapshotInitiatingActor(generationInput()),
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
      snapshotInitiatingActor(generationInput()),
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
      snapshotInitiatingActor(generationInput()),
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
  it('expands each selected space once and delegates the stable union in one retrieval call', async () => {
    const env = snapshotService();
    const input = generationInput();
    input.knowledgeSourceIds = ['direct'];
    input.knowledgeSpaceIds = ['space-a', 'space-b'];
    env.selection.resolve
      .mockResolvedValueOnce({ knowledgeSourceIds: ['space-source', 'direct'] })
      .mockResolvedValueOnce({ knowledgeSourceIds: ['second'] });
    env.retrieval.retrieveSelectedBrandContentMemory.mockResolvedValue([
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
      snapshotInitiatingActor(input),
    );
    expect(result.status).toBe('resolved');
    expect(env.selection.resolve.mock.calls).toEqual([
      ['org', 'brand', { spaceIds: ['space-a'] }],
      ['org', 'brand', { spaceIds: ['space-b'] }],
    ]);
    expect(
      env.retrieval.retrieveSelectedBrandContentMemory,
    ).toHaveBeenCalledExactlyOnceWith(
      {
        organizationId: 'org',
        brandId: 'brand',
        query: input.originalPrompt,
        limit: 5,
        minRelevance: 0.65,
      },
      ['direct', 'space-source', 'second'],
    );
    expect(env.retrieval.retrieveBrandContentMemory).not.toHaveBeenCalled();
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
    'undefined-space',
    'over-limit',
    'empty-result',
    'over-return',
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
      env.retrieval.retrieveSelectedBrandContentMemory.mockResolvedValue([
        hit(),
      ]);
      if (kind === 'dependency') env.moduleRef.get.mockReturnValue(undefined);
      if (kind === 'empty-space') {
        input.knowledgeSpaceIds = ['space'];
        env.selection.resolve.mockResolvedValue({ knowledgeSourceIds: [] });
      }
      if (kind === 'undefined-space') {
        input.knowledgeSpaceIds = ['space'];
        env.selection.resolve.mockResolvedValue(undefined);
      }
      if (kind === 'over-limit')
        input.knowledgeSourceIds = Array.from(
          { length: 9 },
          (_, index) => `source-${index}`,
        );
      if (kind === 'empty-result')
        env.retrieval.retrieveSelectedBrandContentMemory.mockResolvedValue([]);
      if (kind === 'missing-source') {
        input.knowledgeSourceIds.push('missing');
        env.retrieval.retrieveSelectedBrandContentMemory.mockImplementation(
          async () => [hit()],
        );
      }
      if (kind === 'over-return')
        env.retrieval.retrieveSelectedBrandContentMemory.mockResolvedValue(
          Array.from({ length: 9 }, () => hit()),
        );
      if (kind === 'unselected')
        env.retrieval.retrieveSelectedBrandContentMemory.mockResolvedValue([
          hit('other'),
        ]);
      if (kind === 'uncited')
        env.retrieval.retrieveSelectedBrandContentMemory.mockResolvedValue([
          { content: 'Legacy', relevance: 0.9 },
        ]);
      if (kind === 'version')
        env.retrieval.retrieveSelectedBrandContentMemory.mockResolvedValue([
          hit('source', 'version', 0),
        ]);
      if (kind === 'conflicting-version')
        env.retrieval.retrieveSelectedBrandContentMemory.mockResolvedValue([
          hit(),
          hit('source', 'other-version'),
        ]);
      if (kind === 'conflicting-counter')
        env.retrieval.retrieveSelectedBrandContentMemory.mockResolvedValue([
          hit(),
          hit('source', 'knowledge-version', 2),
        ]);
      if (kind === 'source-id')
        env.retrieval.retrieveSelectedBrandContentMemory.mockResolvedValue([
          hit('bad\u0000id'),
        ]);
      if (kind === 'blank-query') input.originalPrompt = ' ';
      if (kind === 'retrieval')
        env.retrieval.retrieveSelectedBrandContentMemory.mockRejectedValue(
          new Error('Embedding failed'),
        );
      if (kind === 'overflow')
        env.retrieval.retrieveSelectedBrandContentMemory.mockResolvedValue([
          hit('source', 'v', 1, 'x'.repeat(6500)),
        ]);
      if (kind === 'altered')
        env.retrieval.retrieveSelectedBrandContentMemory.mockResolvedValue([
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
        snapshotInitiatingActor(input),
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
        env.retrieval.retrieveSelectedBrandContentMemory.mock.calls.length,
      ).toBeLessThanOrEqual(1);
      if (kind === 'undefined-space') {
        expect(result).not.toHaveProperty('compiledPrompt');
        expect(
          env.retrieval.retrieveSelectedBrandContentMemory,
        ).not.toHaveBeenCalled();
        expect(brandedGenerationResolutionV1Schema.parse(result)).toEqual(
          result,
        );
      }
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
      snapshotInitiatingActor(generationInput()),
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
          snapshotInitiatingActor(input as never),
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
    env.retrieval.retrieveSelectedBrandContentMemory.mockResolvedValue([
      passage,
    ]);
    expect(
      await env.service.resolveSnapshotBrief(
        input,
        snapshot(),
        [],
        [],
        env.formatter,
        baselineLearning(),
        {},
        snapshotInitiatingActor(input),
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
      snapshotInitiatingActor(generationInput()),
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
        snapshotInitiatingActor(generationInput()),
      ),
    ).rejects.toHaveProperty('name', 'ZodError');
  });
});

describe('snapshot diagnostic report bounds', () => {
  it('rejects 129 distinct unversioned automatic skills without repeating context calls', async () => {
    const env = snapshotService();
    const automaticSkills = Array.from({ length: 129 }, (_, index) => {
      const entry = skill(`automatic-${index}`);
      delete entry.versionId;
      delete entry.contentHash;
      return entry;
    });
    const before = structuredClone(automaticSkills);
    const result = await env.service.resolveSnapshotBrief(
      generationInput(),
      snapshot(),
      automaticSkills,
      [],
      env.formatter,
      baselineLearning(),
      {},
      snapshotInitiatingActor(generationInput()),
    );
    expect(result).toMatchObject({
      status: 'blocked',
      reasonCode: 'context_unavailable',
      layers: [],
      diagnostics: [
        {
          code: 'context_receipt_bounds_exceeded',
          severity: 'error',
          message:
            'Detailed generation diagnostics exceeded the receipt limit; generation context was not applied.',
        },
      ],
    });
    expect(result).not.toHaveProperty('compiledPrompt');
    expect(brandedGenerationResolutionV1Schema.parse(result)).toEqual(result);
    expect(automaticSkills).toEqual(before);
    expect(env.formatter).not.toHaveBeenCalled();
    expect(env.profile.resolveContributionForBrand).toHaveBeenCalledTimes(1);
    expect(env.packs.composeBriefLayers).toHaveBeenCalledTimes(1);
    expect(env.retrieval.retrieveBrandContentMemory).toHaveBeenCalledTimes(1);
    expect(env.brand.findOne).not.toHaveBeenCalled();
  });
});

describe('snapshot compiler recipe capture', () => {
  it('delegates the old seven-input wrapper once and returns the actual companion result', async () => {
    const env = snapshotService();
    const companion = vi.spyOn(env.service, 'resolveSnapshotBriefWithRecipe');
    const input = generationInput();
    const identity = snapshot();
    const learning = baselineLearning();
    const contribution = {};
    const result = await env.service.resolveSnapshotBrief(
      input,
      identity,
      [],
      [],
      env.formatter,
      learning,
      contribution,
      snapshotInitiatingActor(input),
    );
    expect(companion).toHaveBeenCalledExactlyOnceWith(
      input,
      identity,
      [],
      [],
      env.formatter,
      learning,
      contribution,
    );
    const [captured] = await companion.mock.results[0].value;
    expect(result).toBe(captured);
    expect(env.profile.resolveContributionForBrand).toHaveBeenCalledTimes(1);
    expect(env.packs.composeBriefLayers).toHaveBeenCalledTimes(1);
    expect(env.retrieval.retrieveBrandContentMemory).toHaveBeenCalledTimes(1);
  });

  it('captures exact raw bytes with empty stages and recompiles without lookups', async () => {
    const env = snapshotService();
    const input = { ...generationInput(), mode: 'raw' as const };
    const learning = baselineLearning();
    const [result, recipe] = await env.service.resolveSnapshotBriefWithRecipe(
      input,
      null,
      [skill()],
      [],
      env.formatter,
      learning,
      {},
      snapshotInitiatingActor(input),
    );
    if (!recipe) throw new Error('Expected raw recipe');
    expect(recipe).toEqual(['snapshot-brief-v1', [], [], [], learning, {}]);
    expect(result).toMatchObject({
      status: 'resolved',
      compiledPrompt: input.originalPrompt,
      originalPromptHash: hashBrandedGenerationTextV1(input.originalPrompt),
    });
    expect(
      compileSnapshotBriefResolution(
        input,
        null,
        recipe[4],
        recipe[5],
        recipe[1],
        recipe[2],
        recipe[3],
      ),
    ).toEqual(result);
    expect(env.profile.resolveContributionForBrand).not.toHaveBeenCalled();
    expect(env.packs.composeBriefLayers).not.toHaveBeenCalled();
    expect(env.retrieval.retrieveBrandContentMemory).not.toHaveBeenCalled();
    expect(env.formatter).not.toHaveBeenCalled();
  });

  it('retains dropped optional content and ordered IDs, detaches source data both ways, and reproduces the full resolution', async () => {
    const env = snapshotService();
    const input = generationInput();
    const identity = snapshot();
    const learning = baselineLearning();
    const contribution = {};
    const source = {
      styleDirectives: ['x'.repeat(6500)],
      sources: [
        {
          id: 'source-order',
          kind: 'example' as const,
          title: 'Title',
          content: 'Cafe\u0301 🎨\r\nComplete source',
        },
      ],
    };
    env.packs.composeBriefLayers.mockResolvedValue([
      [{ id: 'drop-pack', version: ' opaque ' }, source],
      [
        { id: 'second-pack', version: 2 },
        { styleDirectives: ['y'.repeat(6500)] },
      ],
    ]);
    const selected = skill('selected');
    selected.instructions = 'Selected\r\nCafe\u0301 🎨';
    const automatic = skill('unversioned');
    delete automatic.versionId;
    delete automatic.contentHash;
    const [result, recipe] = await env.service.resolveSnapshotBriefWithRecipe(
      input,
      identity,
      [selected, automatic],
      ['selected'],
      env.formatter,
      learning,
      contribution,
      snapshotInitiatingActor(input),
    );
    if (!recipe) throw new Error('Expected branded recipe');
    expect(
      result.layers.find((layer) => layer.id === 'drop-pack'),
    ).toMatchObject({ status: 'skipped', omittedIds: ['drop-pack'] });
    const packStage = recipe[2].find(([layer]) => layer.id === 'drop-pack');
    if (!packStage) throw new Error('Expected complete pack stage');
    expect(packStage[1][0].content).toContain('x'.repeat(6500));
    expect(packStage[2]).toEqual([['drop-pack']]);
    expect(
      recipe[2]
        .filter(([layer]) => layer.kind === 'pack')
        .map(([layer, , ids]) => [layer.id, ids]),
    ).toEqual([
      ['drop-pack', [['drop-pack']]],
      ['second-pack', [['second-pack']]],
    ]);
    expect(
      result.layers
        .filter((layer) => layer.kind === 'pack')
        .map((layer) => [layer.id, layer.status, layer.omittedIds]),
    ).toEqual([
      ['drop-pack', 'skipped', ['drop-pack']],
      ['second-pack', 'skipped', ['second-pack']],
    ]);
    const generatedDiagnostic = {
      code: 'skill.version_unavailable',
      severity: 'warning',
      message: 'An optional skill lacks usable immutable instructions.',
    };
    expect(recipe[3]).toEqual([generatedDiagnostic]);
    expect(result.diagnostics[0]).toEqual(generatedDiagnostic);
    expect(recipe[1][0][1][0].content).toBe(selected.instructions);
    const saved = structuredClone(recipe);
    expect(
      compileSnapshotBriefResolution(
        input,
        identity,
        recipe[4],
        recipe[5],
        recipe[1],
        recipe[2],
        recipe[3],
      ),
    ).toEqual(result);
    source.styleDirectives[0] = 'Changed live source';
    selected.instructions = 'Changed live skill';
    learning.privateAccount.configVersion = 'Changed live learning';
    expect(recipe).toEqual(saved);
    packStage[1][0].content = 'Changed captured stage';
    recipe[4].privateAccount.configVersion = 'Changed captured learning';
    expect(source.styleDirectives).toEqual(['Changed live source']);
    expect(selected.instructions).toBe('Changed live skill');
    expect(learning.privateAccount.configVersion).toBe('Changed live learning');
    expect(env.profile.resolveContributionForBrand).toHaveBeenCalledTimes(1);
    expect(env.packs.composeBriefLayers).toHaveBeenCalledTimes(1);
    expect(env.retrieval.retrieveBrandContentMemory).toHaveBeenCalledTimes(1);
    expect(env.formatter).toHaveBeenCalledTimes(1);
    expect(env.brand.findOne).not.toHaveBeenCalled();
  });

  it('captures applied learning before finite-budget suppression and reproduces its exact downgrade', async () => {
    const env = snapshotService();
    const input = generationInput();
    const identity = snapshot();
    identity.generationRules.facts = [
      {
        id: 'fact',
        kind: 'statement',
        subject: 'Product',
        predicate: 'is',
        value: 'Acme',
        evidenceIds: ['e'],
        required: true,
        match: 'literal',
      },
    ];
    identity.generationRules.examples = [
      {
        id: 'example',
        polarity: 'positive',
        text: 'Approved example',
        evidenceIds: ['e'],
      },
    ];
    const [required] = projectBrandSnapshotContributions(identity);
    const length = fitRequiredBrandContextToBudgetWithReport(required, []).text
      .length;
    identity.generationRules.facts[0].value = `Acme${'x'.repeat(6000 - length)}`;
    const learning = treatmentLearning('shared');
    const contribution = learningContribution(
      ContentLearningArm.QUESTION_EXAMPLE,
    );
    const before = structuredClone({ learning, contribution });
    const [result, recipe] = await env.service.resolveSnapshotBriefWithRecipe(
      input,
      identity,
      [],
      [],
      env.formatter,
      learning,
      contribution,
      snapshotInitiatingActor(input),
    );
    if (!recipe) throw new Error('Expected resolved baseline recipe');
    expect(result.status).toBe('resolved');
    expect(result.learning.global.status).toBe('skipped');
    expect(result.learning.privateAccount.application).toMatchObject({
      status: 'suppressed',
      reasonCodes: ['context_budget_exceeded'],
    });
    expect(recipe[4]).toEqual(before.learning);
    expect(recipe[5]).toEqual(before.contribution);
    expect(
      compileSnapshotBriefResolution(
        input,
        identity,
        recipe[4],
        recipe[5],
        recipe[1],
        recipe[2],
        recipe[3],
      ),
    ).toEqual(result);
    expect({ learning, contribution }).toEqual(before);
    contribution.styleDirectives?.push('Changed original contribution');
    expect(recipe[5]).toEqual(before.contribution);
    recipe[5].styleDirectives?.push('Changed captured contribution');
    expect(contribution.styleDirectives).not.toContain(
      'Changed captured contribution',
    );
    expect(env.profile.resolveContributionForBrand).toHaveBeenCalledTimes(1);
    expect(env.packs.composeBriefLayers).toHaveBeenCalledTimes(1);
    expect(env.retrieval.retrieveBrandContentMemory).toHaveBeenCalledTimes(1);
    expect(env.formatter).not.toHaveBeenCalled();
  });

  it.each([
    'identity',
    'identity-scope',
    'raw-learning',
    'media',
    'raw-selection',
    'skill',
    'knowledge',
    'undefined-space',
    'budget',
    'learning',
    'diagnostics',
  ] as const)(
    'returns null recipe for early or late blocked %s',
    async (kind) => {
      const env = snapshotService();
      const input = generationInput();
      let identity: BrandIdentitySnapshotV1 | null = snapshot();
      let skills: ResolvedRuntimeSkill[] = [];
      let requested: string[] = [];
      let learning = baselineLearning();
      if (kind === 'identity') identity = null;
      if (kind === 'identity-scope' && identity)
        identity.organizationId = 'other-org';
      if (kind === 'raw-learning') {
        input.mode = 'raw';
        identity = null;
        learning = treatmentLearning();
      }
      if (kind === 'media') input.format = 'image';
      if (kind === 'raw-selection') {
        input.mode = 'raw';
        identity = null;
        requested = ['missing'];
      }
      if (kind === 'skill') requested = ['missing'];
      if (kind === 'knowledge') input.knowledgeSourceIds = ['missing'];
      if (kind === 'undefined-space') {
        input.knowledgeSpaceIds = ['space'];
        env.selection.resolve.mockResolvedValue(undefined);
      }
      if (kind === 'budget') input.originalPrompt = 'x'.repeat(65500);
      if (kind === 'learning') learning = treatmentLearning();
      if (kind === 'diagnostics')
        skills = Array.from({ length: 129 }, (_, index) => {
          const entry = skill(`unversioned-${index}`);
          delete entry.versionId;
          delete entry.contentHash;
          return entry;
        });
      const [result, recipe] = await env.service.resolveSnapshotBriefWithRecipe(
        input,
        identity,
        skills,
        requested,
        env.formatter,
        learning,
        {},
        snapshotInitiatingActor(input),
      );
      expect(recipe).toBeNull();
      expect(result.status).toBe('blocked');
      expect(result).not.toHaveProperty('compiledPrompt');
      expect(
        result.layers.some(
          (layer) => layer.status === 'applied' || layer.status === 'truncated',
        ),
      ).toBe(false);
      expect(brandedGenerationResolutionV1Schema.parse(result)).toEqual(result);
      if (kind === 'diagnostics')
        expect(result).toMatchObject({
          reasonCode: 'context_unavailable',
          diagnostics: [{ code: 'context_receipt_bounds_exceeded' }],
        });
      if (kind === 'undefined-space') {
        expect(result).toMatchObject({ reasonCode: 'knowledge_unavailable' });
        expect(env.retrieval.retrieveBrandContentMemory).not.toHaveBeenCalled();
        expect(env.profile.resolveContributionForBrand).not.toHaveBeenCalled();
        expect(env.packs.composeBriefLayers).not.toHaveBeenCalled();
      }
      expect(
        env.retrieval.retrieveBrandContentMemory.mock.calls.length,
      ).toBeLessThanOrEqual(1);
      expect(
        env.profile.resolveContributionForBrand.mock.calls.length,
      ).toBeLessThanOrEqual(1);
      expect(
        env.packs.composeBriefLayers.mock.calls.length,
      ).toBeLessThanOrEqual(1);
    },
  );

  it('preserves malformed canonical input exceptions', async () => {
    const env = snapshotService();
    await expect(
      env.service.resolveSnapshotBriefWithRecipe(
        { ...generationInput(), schemaVersion: 2 } as never,
        snapshot(),
        [],
        [],
        env.formatter,
        baselineLearning(),
        {},
        snapshotInitiatingActor({
          ...generationInput(),
          schemaVersion: 2,
        } as never),
      ),
    ).rejects.toThrow();
    expect(env.profile.resolveContributionForBrand).not.toHaveBeenCalled();
    expect(env.packs.composeBriefLayers).not.toHaveBeenCalled();
  });
});
