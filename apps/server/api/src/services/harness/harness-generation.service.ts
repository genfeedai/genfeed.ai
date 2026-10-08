import { BrandAccessService } from '@api/authorization/brand-access/brand-access.service';
import { BrandOsRevisionsService } from '@api/collections/brands/services/brand-os-revisions.service';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { KnowledgeContentRetrievalService } from '@api/collections/contexts/services/knowledge-content-retrieval.service';
import { KnowledgeSelectionService } from '@api/collections/contexts/services/knowledge-selection.service';
import { resolveKnowledgeMinRelevance } from '@api/collections/contexts/utils/knowledge-source.util';
import { HarnessProfilesService } from '@api/collections/harness-profiles/services/harness-profiles.service';
import { resolveOptionalProvider } from '@api/helpers/utils/module-ref/resolve-optional-provider.util';
import type { BrandContextContribution } from '@api/services/agent-context-assembly/interfaces/context-assembly.interface';
import type {
  BrandedGenerationCompilerCaptureV1,
  BrandedGenerationCompilerRecipeV1,
} from '@api/services/branded-generation-receipts/branded-generation-recompile.types';
import {
  compileSnapshotBriefResolution,
  renderSnapshotHarnessContribution,
  type SnapshotContextStage,
  type SnapshotStageResult,
} from '@api/services/harness/branded-generation-compiler';
import { ContentHarnessService } from '@api/services/harness/harness.service';
import {
  buildHarnessInput,
  formatHarnessBrief,
  type PersonaSource,
} from '@api/services/harness/harness-brief.util';
import { brandMemoryHitsToHarnessSources } from '@api/services/harness/harness-context-sources.util';
import {
  retrieveSelectedKnowledge,
  SELECTED_KNOWLEDGE_PASSAGE_BUDGET,
} from '@api/services/harness/harness-selected-knowledge-retrieval.util';
import type { SkillRuntimeService } from '@api/services/skill-runtime/skill-runtime.service';
import {
  brandedGenerationInputV1Schema,
  brandGenerationLayerReceiptV1Schema,
  brandGenerationLayerVersionV1Schema,
  brandIdentitySnapshotV1Schema,
  brandLearningApplicationV1Schema,
} from '@genfeedai/contracts/api-types/contracts/branded-generation.contract';
import {
  learningContractIdSchema,
  learningContractVersionSchema,
} from '@genfeedai/contracts/api-types/contracts/content-learning-generation.contract';
import {
  KnowledgeSourceKind,
  KnowledgeSourcePurpose,
} from '@genfeedai/contracts/enums';
import type {
  BrandedGenerationInputV1,
  BrandedGenerationResolutionV1,
  BrandIdentitySnapshotV1,
  BrandLearningApplicationV1,
  KnowledgeRetrievalFilters,
  KnowledgeSelection,
} from '@genfeedai/contracts/interfaces';
import type { ResolveActiveSkillsContext } from '@genfeedai/contracts/interfaces/ai';
import type {
  ContentHarnessContribution,
  ContentHarnessInput,
} from '@genfeedai/harness';
import {
  type ContentHarnessBrief,
  type ContentHarnessSurface,
  type ContentKind,
  type ContentObjective,
  type HarnessSourceRecord,
} from '@genfeedai/harness';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, Optional, type Type } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';

export const HARNESS_MEMORY_LIMIT = 5;
export const HARNESS_SELECTED_KNOWLEDGE_LIMIT =
  SELECTED_KNOWLEDGE_PASSAGE_BUDGET;
export const HARNESS_MEMORY_MIN_RELEVANCE = 0.65;

export type ResolveHarnessBriefParams = {
  userId?: string;
  isApiKey?: boolean;
  scopes?: string[];
  /**
   * Extra sources (e.g. caller-supplied audience signals) folded into the
   * brief alongside any retrieved brand content memory. Caller-supplied
   * sources are listed first, memory hits after.
   */
  additionalSources?: HarnessSourceRecord[];
  brandId?: string;
  contentType: ContentKind;
  /**
   * When true (default if topic is set), retrieve brand content memory from
   * Postgres pgvector and fold hits into the brief as sources.
   */
  includeContentMemory?: boolean;
  /**
   * Explicit Knowledge sources, spaces or purposes for this execution. When
   * set, retrieval is constrained to the selection and the passage budget
   * grows so chosen material is not crowded out by generic memory.
   */
  knowledgeSelection?: KnowledgeSelection;
  objective?: ContentObjective;
  organizationId: string;
  persona?: PersonaSource | null;
  platform?: string;
  /**
   * `media` composes only packs applicable to image, video and audio prompts;
   * copywriting packs are left out. Absent means every pack.
   */
  surface?: ContentHarnessSurface;
  topic?: string;
};

function captureSnapshotBriefResolution(
  ...args: Parameters<typeof compileSnapshotBriefResolution>
): BrandedGenerationCompilerCaptureV1 {
  const recipe = structuredClone<BrandedGenerationCompilerRecipeV1>([
    'snapshot-brief-v1',
    args[4],
    args[5],
    args[6],
    args[2],
    args[3],
  ]);
  const result = compileSnapshotBriefResolution(...args);
  return [result, result.status === 'resolved' ? recipe : null];
}

/**
 * Single entry for generation paths (text, media, ads, quality) that need a
 * brand harness brief without re-implementing compose + profile load.
 *
 * Day-one content memory: Postgres pgvector ContextEntry (HNSW), not a separate
 * vector product. Profile few-shots are always-on; similar winners/library are
 * retrieved when a topic is present.
 */
@Injectable()
export class HarnessGenerationService {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly contentHarnessService: ContentHarnessService,
    private readonly logger: LoggerService,
    private readonly brandAccessService: BrandAccessService,
    @Optional()
    private readonly brandsService?: BrandsService,
    @Optional()
    private readonly harnessProfilesService?: HarnessProfilesService,
    @Optional()
    private readonly knowledgeContentRetrievalService?: KnowledgeContentRetrievalService,
    @Optional()
    private readonly moduleRef?: ModuleRef,
    @Optional()
    private readonly brandOsRevisionsService?: BrandOsRevisionsService,
  ) {}

  async resolveSnapshotBrief(
    input: BrandedGenerationInputV1,
    snapshot: BrandIdentitySnapshotV1 | null,
    resolvedSkills: Awaited<
      ReturnType<SkillRuntimeService['resolveActiveSkills']>
    >,
    requestedSkillSlugs: ResolveActiveSkillsContext['requestedSkillSlugs'],
    renderSkillSections: SkillRuntimeService['buildSkillPromptSections'],
    learning: BrandLearningApplicationV1,
    learningContribution: ContentHarnessContribution,
  ): Promise<BrandedGenerationResolutionV1> {
    const [result] = await this.resolveSnapshotBriefWithRecipe(
      input,
      snapshot,
      resolvedSkills,
      requestedSkillSlugs,
      renderSkillSections,
      learning,
      learningContribution,
    );
    return result;
  }

  async resolveSnapshotBriefWithRecipe(
    ...args: Parameters<HarnessGenerationService['resolveSnapshotBrief']>
  ): Promise<BrandedGenerationCompilerCaptureV1> {
    const [
      input,
      snapshot,
      resolvedSkills,
      requestedSkillSlugs,
      renderSkillSections,
      learning,
      learningContribution,
    ] = args;
    const parsed = brandedGenerationInputV1Schema.parse(input);
    const identity =
      snapshot === null ? null : brandIdentitySnapshotV1Schema.parse(snapshot);
    const application = brandLearningApplicationV1Schema.parse(learning);
    const compile = (
      scope: BrandIdentitySnapshotV1 | null,
      failure?: readonly [string, string?],
    ) =>
      captureSnapshotBriefResolution(
        parsed,
        scope,
        application,
        learningContribution,
        [],
        [],
        [],
        failure,
      );
    const selected = Boolean(
      requestedSkillSlugs?.length ||
        parsed.knowledgeSourceIds.length ||
        parsed.knowledgeSpaceIds.length,
    );
    if (parsed.mode === 'raw') {
      const privateApplication = application.privateAccount.application;
      if (
        identity ||
        application.brandFeedback.status === 'applied' ||
        application.global.status === 'applied' ||
        privateApplication?.status === 'applied' ||
        privateApplication?.privatePolicyApplied ||
        privateApplication?.sharedReleaseApplied
      )
        return compile(null, ['identity_conflict']);
      return compile(
        null,
        selected
          ? ['context_unavailable', 'raw_mode_selection_conflict']
          : undefined,
      );
    }
    await this.brandAccessService.assert(
      { userId: parsed.actorId, organizationId: parsed.organizationId },
      parsed.brandId,
    );
    if (!identity) return compile(null, ['no_approved_revision']);
    if (
      identity.organizationId !== parsed.organizationId ||
      identity.brandId !== parsed.brandId ||
      identity.approval !==
        (parsed.mode === 'approved_brand' ? 'approved' : 'provisional')
    )
      return compile(null, ['identity_conflict']);
    if (parsed.format !== 'text' && parsed.format !== 'thread')
      return compile(identity, ['unsupported_capability']);
    const [explicitSkills, autoSkills, skillDiagnostics, skillFailure] =
      this.resolveSnapshotSkills(
        resolvedSkills,
        requestedSkillSlugs,
        renderSkillSections,
      );
    if (skillFailure)
      return captureSnapshotBriefResolution(
        parsed,
        identity,
        application,
        learningContribution,
        [],
        [],
        skillDiagnostics,
        ['context_unavailable', skillFailure],
      );
    const [sourceIds, explicitKnowledge, selectionFailure] =
      await this.resolveSnapshotKnowledgeSelection(parsed);
    if (selectionFailure)
      return compile(identity, ['knowledge_unavailable', selectionFailure]);
    const [knowledge, knowledgeDiagnostics, knowledgeFailure] =
      await this.retrieveSnapshotKnowledge(
        parsed,
        sourceIds,
        explicitKnowledge,
      );
    if (knowledgeFailure)
      return captureSnapshotBriefResolution(
        parsed,
        identity,
        application,
        learningContribution,
        [],
        [],
        knowledgeDiagnostics,
        ['knowledge_unavailable'],
      );
    const profile = await this.resolveSnapshotProfile(parsed);
    const packs = await this.resolveSnapshotPacks(parsed, identity);
    return captureSnapshotBriefResolution(
      parsed,
      identity,
      application,
      learningContribution,
      [...explicitSkills, ...(explicitKnowledge ? knowledge : [])],
      [
        ...profile,
        ...autoSkills,
        ...packs,
        ...(explicitKnowledge ? [] : knowledge),
      ],
      [...skillDiagnostics, ...knowledgeDiagnostics],
    );
  }

  private async resolveSnapshotProfile(
    input: BrandedGenerationInputV1,
  ): Promise<SnapshotContextStage[]> {
    const provider = this.resolveProvider(
      this.harnessProfilesService,
      HarnessProfilesService,
    );
    let profile: Awaited<
      ReturnType<HarnessProfilesService['resolveContributionForBrand']>
    >;
    try {
      if (!provider) throw new Error('Profile unavailable');
      profile = await provider.resolveContributionForBrand(
        input.organizationId,
        input.brandId,
      );
    } catch {
      return [
        [
          {
            kind: 'harness_profile',
            status: 'unavailable',
            reasonCode: 'profile_context_unavailable',
            evidenceIds: [],
            omittedIds: [],
          },
          [],
          [],
        ],
      ];
    }
    if (!profile)
      return [
        [
          {
            kind: 'harness_profile',
            status: 'not_applicable',
            evidenceIds: [],
            omittedIds: [],
          },
          [],
          [],
        ],
      ];
    const section = renderSnapshotHarnessContribution(
      profile.contribution,
      true,
    );
    const layer = brandGenerationLayerReceiptV1Schema.parse({
      kind: 'harness_profile',
      id: learningContractIdSchema.parse(profile.profileId),
      status: 'not_applicable',
      evidenceIds: [],
      omittedIds: [],
    });
    return [
      [layer, section ? [section] : [], section ? [[profile.profileId]] : []],
    ];
  }

  private resolveSnapshotSkills(
    skills: Awaited<ReturnType<SkillRuntimeService['resolveActiveSkills']>>,
    requested: ResolveActiveSkillsContext['requestedSkillSlugs'],
    formatter: SkillRuntimeService['buildSkillPromptSections'],
  ): readonly [
    SnapshotContextStage[],
    SnapshotContextStage[],
    BrandIdentitySnapshotV1['diagnostics'],
    string?,
  ] {
    const explicit = [...new Set(requested ?? [])];
    const selected: SnapshotContextStage[] = [];
    const automatic: SnapshotContextStage[] = [];
    const diagnostics: BrandIdentitySnapshotV1['diagnostics'] = [];
    if (explicit.some((slug) => !skills.some((skill) => skill.slug === slug)))
      return [[], [], [], 'skill.selection_unavailable'];
    const ordered = [
      ...explicit.map((slug) => skills.find((skill) => skill.slug === slug)),
      ...skills.filter((skill) => !explicit.includes(skill.slug)),
    ];
    for (const skill of ordered) {
      if (!skill) continue;
      const required = explicit.includes(skill.slug);
      const layer = {
        kind: 'skill' as const,
        id: skill.versionId,
        contentHash: skill.contentHash,
        status: 'not_applicable' as const,
        evidenceIds: [],
        omittedIds: [],
      };
      const valid =
        skill.instructions?.trim() &&
        skill.versionId &&
        skill.contentHash &&
        brandGenerationLayerReceiptV1Schema.safeParse({
          ...layer,
          status: 'applied',
        }).success;
      let text = '';
      let reason = valid ? '' : 'skill.version_unavailable';
      if (valid) {
        try {
          text = formatter([skill], [skill.slug]);
        } catch {
          reason = 'skill.selection_unavailable';
        }
        if (!text && !reason) reason = 'skill.selection_unavailable';
      }
      if (reason) {
        if (required) return [[], [], diagnostics, reason];
        automatic.push([
          {
            kind: 'skill',
            status: 'unavailable',
            reasonCode: reason,
            evidenceIds: [],
            omittedIds: [],
          },
          [],
          [],
        ]);
        diagnostics.push({
          code: reason,
          severity: 'warning',
          message: 'An optional skill lacks usable immutable instructions.',
        });
        continue;
      }
      const section: BrandContextContribution = {
        header: '',
        content: text,
        untrusted: false,
        isAtomic: true,
      };
      (required ? selected : automatic).push([
        layer,
        [section],
        [[skill.versionId ?? '']],
      ]);
    }
    return [selected, automatic, diagnostics];
  }

  private async resolveSnapshotKnowledgeSelection(
    input: BrandedGenerationInputV1,
  ): Promise<readonly [string[], boolean, string?]> {
    const explicit = Boolean(
      input.knowledgeSourceIds.length || input.knowledgeSpaceIds.length,
    );
    if (!explicit) return [[], false];
    const selection = this.resolveProvider(
      undefined,
      KnowledgeSelectionService,
    );
    const retrieval = this.resolveProvider(
      this.knowledgeContentRetrievalService,
      KnowledgeContentRetrievalService,
    );
    if (!selection || !retrieval) return [[], true, 'knowledge_unavailable'];
    const sources = new Set(input.knowledgeSourceIds);
    try {
      for (const spaceId of input.knowledgeSpaceIds) {
        const expanded = await selection.resolve(
          input.organizationId,
          input.brandId,
          { spaceIds: [spaceId] },
        );
        if (!expanded?.knowledgeSourceIds?.length)
          return [[], true, 'knowledge_unavailable'];
        for (const id of expanded.knowledgeSourceIds) sources.add(id);
      }
    } catch {
      return [[], true, 'knowledge_unavailable'];
    }
    return sources.size > HARNESS_SELECTED_KNOWLEDGE_LIMIT
      ? [[], true, 'knowledge.selection_budget_exceeded']
      : [[...sources], true];
  }

  private async retrieveSnapshotKnowledge(
    input: BrandedGenerationInputV1,
    sourceIds: string[],
    explicit: boolean,
  ): Promise<SnapshotStageResult> {
    const provider = this.resolveProvider(
      this.knowledgeContentRetrievalService,
      KnowledgeContentRetrievalService,
    );
    const unavailable = (): SnapshotStageResult => [
      [
        [
          {
            kind: 'knowledge',
            status: 'unavailable',
            reasonCode: 'knowledge_unavailable',
            evidenceIds: [],
            omittedIds: [],
          },
          [],
          [],
        ],
      ],
      [
        {
          code: 'knowledge_unavailable',
          severity: 'warning',
          message: 'Immutable Knowledge context is unavailable.',
        },
      ],
      explicit ? 'knowledge_unavailable' : undefined,
    ];
    if (!provider || !input.originalPrompt.trim()) return unavailable();
    let hits: Awaited<
      ReturnType<KnowledgeContentRetrievalService['retrieveBrandContentMemory']>
    >;
    try {
      const retrievalInput = {
        organizationId: input.organizationId,
        userId: input.actorId,
        brandId: input.brandId,
        query: input.originalPrompt,
        limit: HARNESS_MEMORY_LIMIT,
        minRelevance: HARNESS_MEMORY_MIN_RELEVANCE,
      };
      hits = explicit
        ? await retrieveSelectedKnowledge(provider, retrievalInput, sourceIds)
        : await provider.retrieveBrandContentMemory(retrievalInput);
    } catch {
      return unavailable();
    }
    const groups = new Map<string, SnapshotContextStage>();
    const versions = new Map<string, string>();
    let omitted = false;
    for (const hit of hits) {
      const citation = hit.citation;
      const valid =
        citation &&
        typeof hit.content === 'string' &&
        hit.content.trim() &&
        learningContractVersionSchema.safeParse(citation.version).success &&
        typeof citation.title === 'string' &&
        Boolean(citation.title.trim()) &&
        Object.values(KnowledgeSourceKind).includes(citation.kind) &&
        Object.values(KnowledgeSourcePurpose).includes(citation.purpose) &&
        learningContractIdSchema.safeParse(citation.versionId).success &&
        learningContractIdSchema.safeParse(citation.sourceId).success;
      if (!valid || (explicit && !sourceIds.includes(citation.sourceId))) {
        if (explicit) return unavailable();
        omitted = true;
        continue;
      }
      if (
        versions.has(citation.sourceId) &&
        versions.get(citation.sourceId) !==
          JSON.stringify([citation.versionId, citation.version])
      )
        return unavailable();
      versions.set(
        citation.sourceId,
        JSON.stringify([citation.versionId, citation.version]),
      );
      const section: BrandContextContribution = {
        header: '',
        content: JSON.stringify({ content: hit.content, citation }),
        untrusted: true,
        isAtomic: true,
      };
      const existing = groups.get(citation.versionId);
      groups.set(citation.versionId, [
        {
          kind: 'knowledge',
          id: citation.versionId,
          status: 'not_applicable',
          evidenceIds: [],
          omittedIds: [],
        },
        [...(existing?.[1] ?? []), section],
        [...(existing?.[2] ?? []), [citation.versionId]],
      ]);
    }
    if (explicit && (!hits.length || sourceIds.some((id) => !versions.has(id))))
      return unavailable();
    const stages = [...groups.values()];
    if (!omitted) return [stages, []];
    const [missing, diagnostics] = unavailable();
    return [[...stages, ...missing], diagnostics];
  }

  private async resolveSnapshotPacks(
    input: BrandedGenerationInputV1,
    snapshot: BrandIdentitySnapshotV1,
  ): Promise<SnapshotContextStage[]> {
    const objectives = {
      awareness: 'awareness',
      engagement: 'engagement',
      'authority-proxy': 'authority',
      'conversion-click': 'conversion',
      'retention-watch': 'retention',
    } as const;
    const packInput: ContentHarnessInput = {
      organizationId: input.organizationId,
      brandId: input.brandId,
      brandName: snapshot.identity.name,
      brandOsRevisionId: snapshot.revisionId,
      voiceProfile: {
        ...(snapshot.voice.tone !== undefined
          ? { tone: snapshot.voice.tone }
          : {}),
        ...(snapshot.voice.style !== undefined
          ? { style: snapshot.voice.style }
          : {}),
        audience: [...snapshot.voice.audience],
        values: [...snapshot.voice.values],
        messagingPillars: [...snapshot.voice.messagingPillars],
        doNotSoundLike: [...snapshot.voice.avoid],
        ...(snapshot.voice.sample !== undefined
          ? { sampleOutput: snapshot.voice.sample }
          : {}),
      },
      intent: {
        contentType: input.contentType,
        objective: input.objective ? objectives[input.objective] : 'engagement',
        topic: input.originalPrompt,
        ...(input.platform !== undefined ? { platform: input.platform } : {}),
      },
    };
    let packs: Awaited<ReturnType<ContentHarnessService['composeBriefLayers']>>;
    try {
      packs = await this.contentHarnessService.composeBriefLayers(packInput);
    } catch {
      return [
        [
          {
            kind: 'pack',
            status: 'unavailable',
            reasonCode: 'pack_context_unavailable',
            evidenceIds: [],
            omittedIds: [],
          },
          [],
          [],
        ],
      ];
    }
    return packs.map(([metadata, contribution]): SnapshotContextStage => {
      const base = brandGenerationLayerReceiptV1Schema.parse({
        kind: 'pack',
        id: learningContractIdSchema.parse(metadata.id),
        status: 'not_applicable',
        evidenceIds: [],
        omittedIds: [],
      });
      if (
        !brandGenerationLayerVersionV1Schema.safeParse(metadata.version).success
      )
        return [
          {
            ...base,
            status: 'unavailable',
            reasonCode: 'pack_version_invalid',
          },
          [],
          [],
        ];
      const section = renderSnapshotHarnessContribution(contribution, false);
      return [
        { ...base, version: metadata.version },
        section ? [section] : [],
        section ? [[metadata.id]] : [],
      ];
    });
  }

  async resolveBrief(
    params: ResolveHarnessBriefParams,
  ): Promise<ContentHarnessBrief | null> {
    const brandsService = this.resolveProvider(
      this.brandsService,
      BrandsService,
    );
    const harnessProfilesService = this.resolveProvider(
      this.harnessProfilesService,
      HarnessProfilesService,
    );
    if (!params.brandId || !brandsService || !harnessProfilesService) {
      return null;
    }

    await this.brandAccessService.assert(
      { ...params, userId: params.userId ?? '' },
      params.brandId,
    );
    try {
      const brand = await brandsService.findOne({
        id: params.brandId,
        isDeleted: false,
        organizationId: params.organizationId,
      });
      if (!brand) {
        return null;
      }

      const brandOsRevisionsService = this.resolveProvider(
        this.brandOsRevisionsService,
        BrandOsRevisionsService,
      );
      const brandOsRevision = await brandOsRevisionsService?.findApproved(
        params.organizationId,
        params.brandId,
      );

      const profile = await harnessProfilesService.resolveContributionForBrand(
        params.organizationId,
        params.brandId,
      );

      const knowledgeFilters = await this.resolveKnowledgeFilters(params);
      const includeMemory =
        params.includeContentMemory ??
        (Boolean(knowledgeFilters) || Boolean(params.topic?.trim()));
      const memorySources =
        includeMemory && params.topic?.trim()
          ? await this.loadBrandMemorySources({
              brandId: params.brandId,
              userId: params.userId ?? '',
              isApiKey: params.isApiKey,
              scopes: params.scopes,
              filters: knowledgeFilters,
              organizationId: params.organizationId,
              topic: params.topic.trim(),
            })
          : [];

      const harnessInput = buildHarnessInput({
        additionalSources: [
          ...(params.additionalSources ?? []),
          ...memorySources,
        ],
        brand,
        brandOsRevision,
        harnessProfileId: profile?.profileId,
        intent: {
          contentType: params.contentType,
          objective: params.objective ?? 'engagement',
          platform: params.platform,
          topic: params.topic,
        },
        organizationId: params.organizationId,
        persona: params.persona,
        profileContribution: profile?.contribution,
      });
      const brief = params.surface
        ? await this.contentHarnessService.composeBrief(harnessInput, {
            surface: params.surface,
          })
        : await this.contentHarnessService.composeBrief(harnessInput);
      // Operator-only receipt: pack IDs and versions, never pack contents.
      this.logger.log(`${this.constructorName} applied content harness packs`, {
        appliedPacks: brief.appliedPacks,
        brandId: params.brandId,
        contentType: params.contentType,
        organizationId: params.organizationId,
      });
      return brief;
    } catch (error: unknown) {
      this.logger.warn(
        `${this.constructorName} failed to resolve harness brief`,
        {
          brandId: params.brandId,
          error: error instanceof Error ? error.message : 'unknown',
          organizationId: params.organizationId,
        },
      );
      return null;
    }
  }

  formatBrief(brief: ContentHarnessBrief | null | undefined): string {
    return formatHarnessBrief(brief);
  }

  private async resolveKnowledgeFilters(
    params: ResolveHarnessBriefParams,
  ): Promise<KnowledgeRetrievalFilters | undefined> {
    if (!params.knowledgeSelection) {
      return undefined;
    }
    const selectionService = this.resolveProvider(
      undefined,
      KnowledgeSelectionService,
    );
    if (!selectionService) {
      return undefined;
    }
    return selectionService.resolve(
      params.organizationId,
      params.brandId,
      params.knowledgeSelection,
    );
  }

  private async loadBrandMemorySources(params: {
    userId: string;
    isApiKey?: boolean;
    scopes?: string[];
    brandId: string;
    filters?: KnowledgeRetrievalFilters;
    organizationId: string;
    topic: string;
  }): Promise<HarnessSourceRecord[]> {
    const knowledgeContentRetrievalService = this.resolveProvider(
      this.knowledgeContentRetrievalService,
      KnowledgeContentRetrievalService,
    );
    if (!knowledgeContentRetrievalService) {
      return [];
    }

    const limit = params.filters
      ? HARNESS_SELECTED_KNOWLEDGE_LIMIT
      : HARNESS_MEMORY_LIMIT;
    const minRelevance = resolveKnowledgeMinRelevance(
      params.filters?.knowledgeSourceIds,
      HARNESS_MEMORY_MIN_RELEVANCE,
    );
    try {
      const hits =
        await knowledgeContentRetrievalService.retrieveBrandContentMemory({
          brandId: params.brandId,
          userId: params.userId,
          isApiKey: params.isApiKey,
          scopes: params.scopes,
          limit,
          minRelevance,
          organizationId: params.organizationId,
          query: params.topic,
          ...(params.filters ?? {}),
        });
      return brandMemoryHitsToHarnessSources(hits, {
        limit,
        minRelevance,
      });
    } catch (error: unknown) {
      this.logger.warn(
        `${this.constructorName} brand content memory retrieval failed`,
        {
          brandId: params.brandId,
          error: error instanceof Error ? error.message : 'unknown',
          organizationId: params.organizationId,
        },
      );
      return [];
    }
  }

  private resolveProvider<T>(
    direct: T | undefined,
    token: Type<T>,
  ): T | undefined {
    if (direct) {
      return direct;
    }
    return resolveOptionalProvider(this.moduleRef, token);
  }
}
