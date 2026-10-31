import { createHash, randomUUID } from 'node:crypto';
import { toBrandGenerationReferences } from '@api/collections/brands/utils/brand-kit-generation-references.util';
import { BrandRemixRunPlanningService } from '@api/collections/content-runs/services/brand-remix-run-planning.service';
import {
  MAX_SERIALIZATION_RETRIES,
  PRISMA_SERIALIZATION_FAILURE,
  RUN_SELECT,
} from '@api/collections/content-runs/services/brand-remix-runs.types';
import { contentRunTitleSearch } from '@api/collections/content-runs/services/content-run-title-search';
import {
  type StoryboardStoredRunConfig,
  storyboardStoredRunConfigSchema,
} from '@api/collections/content-runs/services/storyboard-imported-run-state.schema';
import {
  normalizeStoryboardLongForm,
  STORYBOARD_LONG_FORM_DEFAULT_RUNTIME_SECONDS,
  storyboardLongFormRuntime,
} from '@api/collections/content-runs/services/storyboard-long-form-draft';
import {
  normalizeStoryboardTiming,
  requiresStoryboardCapabilities,
  storyboardCapabilityError,
} from '@api/collections/content-runs/services/storyboard-plan-capabilities';
import { STORYBOARD_DEFAULT_RUNTIME_BUDGET_SECONDS } from '@api/collections/content-runs/services/storyboard-plan-draft';
import { StoryboardPlanDraftService } from '@api/collections/content-runs/services/storyboard-plan-draft.service';
import {
  approveStoryboardPlan,
  assertStoryboardEditable,
  editStoryboardPlan,
} from '@api/collections/content-runs/services/storyboard-plan-state';
import { StoryboardRunCapabilitiesService } from '@api/collections/content-runs/services/storyboard-run-capabilities.service';
import {
  projectStoryboardRun,
  StoryboardRunStoreService,
  storyboardJson,
} from '@api/collections/content-runs/services/storyboard-run-store.service';
import { StoryboardSourceService } from '@api/collections/content-runs/services/storyboard-source.service';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ContentRunStatus } from '@genfeedai/contracts';
import {
  type StoryboardPlan,
  storyboardPlanSchema,
  updateStoryboardPlanSchema,
} from '@genfeedai/contracts/api-types/contracts/storyboard-plan.contract';
import {
  controlStoryboardRunSchema,
  createStoryboardRunSchema,
  draftStoryboardPlanSchema,
  STORYBOARD_RUN_CONTRACT,
  STORYBOARD_RUN_VERSION,
  type StoryboardRun,
  type StoryboardRunConfig,
  storyboardRunConfigSchema,
  updateStoryboardSourceSchema,
} from '@genfeedai/contracts/api-types/contracts/storyboard-run.contract';
import {
  listStoryboardRunsSchema,
  type StoryboardRunSummary,
  storyboardRunSummarySchema,
} from '@genfeedai/contracts/api-types/contracts/storyboard-run-summary.contract';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  ConflictException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { ZodType } from 'zod';

function parseInput<T>(schema: ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success)
    throw new BadRequestException(
      parsed.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; '),
    );
  return parsed.data;
}

function canonicalInput(value: unknown): string {
  if (value === null || typeof value !== 'object')
    return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalInput).join(',')}]`;
  return `{${Object.entries(value)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalInput(item)}`)
    .join(',')}}`;
}

@Injectable()
export class StoryboardRunsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly planning: BrandRemixRunPlanningService,
    private readonly source: StoryboardSourceService,
    private readonly store: StoryboardRunStoreService,
    private readonly capabilities: StoryboardRunCapabilitiesService,
    private readonly logger: LoggerService,
    private readonly drafter: StoryboardPlanDraftService,
  ) {}

  async create(
    organizationId: string,
    brandId: string,
    userId: string,
    body: unknown,
  ): Promise<StoryboardRun> {
    const input = parseInput(createStoryboardRunSchema, body);
    const submittedInputHash = createHash('sha256')
      .update(canonicalInput(input))
      .digest('hex');
    for (let attempt = 0; attempt < MAX_SERIALIZATION_RETRIES; attempt++) {
      try {
        return await this.prisma.$transaction(
          async (transaction) => {
            const existing = await transaction.contentRun.findFirst({
              select: RUN_SELECT,
              where: scopedWhere(organizationId, {
                brandId,
                AND: [
                  {
                    config: {
                      path: ['contract'],
                      equals: STORYBOARD_RUN_CONTRACT,
                    },
                  },
                  {
                    config: {
                      path: ['clientRequestId'],
                      equals: input.clientRequestId,
                    },
                  },
                  { config: { path: ['createdByUserId'], equals: userId } },
                ],
              }),
            });
            if (existing) {
              const saved = storyboardRunConfigSchema.parse(existing.config);
              if (saved.submittedInputHash !== submittedInputHash)
                throw new ConflictException(
                  'This request ID already created a different storyboard. Use a new request ID for a new intent.',
                );
              return projectStoryboardRun(existing);
            }
            const context = await this.planning.resolveBrandContext(
              organizationId,
              brandId,
            );
            const sourceSnapshot = await this.source.resolve(
              organizationId,
              brandId,
              input.source,
            );
            const isLongForm =
              input.source.kind === 'brief' &&
              input.source.length === 'long_form';
            // A long-form talking-head video is landscape; short ones are vertical.
            const settings = input.planSettings ?? {
              videoModelKey: null,
              format: isLongForm ? ('16:9' as const) : ('9:16' as const),
              runtimeBudgetSeconds:
                'durationSeconds' in sourceSnapshot
                  ? sourceSnapshot.durationSeconds
                  : null,
              styleReferenceAssetIds: toBrandGenerationReferences(
                context.brandKit,
              )
                .map((reference) => reference.assetId)
                .slice(0, 20),
              cast: [],
            };
            const seedImageAssetId =
              input.source.kind === 'brief'
                ? input.source.seedImageAssetId
                : undefined;
            const plan = storyboardPlanSchema.parse({
              ...settings,
              title: '',
              logline: '',
              ...(isLongForm
                ? {
                    runtimeBudgetSeconds: null,
                    longForm: {
                      runtimeBudgetSeconds:
                        STORYBOARD_LONG_FORM_DEFAULT_RUNTIME_SECONDS,
                      segments: [],
                    },
                  }
                : {}),
              shots:
                seedImageAssetId && !isLongForm
                  ? [
                      {
                        id: randomUUID(),
                        ordinal: 1,
                        action: '',
                        onScreenSpeaker: false,
                        durationSeconds: null,
                        stillAssetId: seedImageAssetId,
                        stillFreshness: 'stale',
                        transition: 'cut',
                      },
                    ]
                  : [],
            });
            await this.source.validatePlanAssets(organizationId, brandId, plan);
            const config: StoryboardRunConfig = {
              origin: 'native',
              contract: STORYBOARD_RUN_CONTRACT,
              version: STORYBOARD_RUN_VERSION,
              revision: 1,
              state:
                input.source.kind === 'brief'
                  ? 'storyboard'
                  : 'awaiting_analysis',
              clientRequestId: input.clientRequestId,
              createdByUserId: userId,
              submittedInputHash,
              sourceSnapshot,
              plan,
            };
            const record = await transaction.contentRun.create({
              select: RUN_SELECT,
              data: {
                organizationId,
                brandId,
                isDeleted: false,
                status: ContentRunStatus.PENDING,
                config: storyboardJson(config),
              },
            });
            return projectStoryboardRun(record);
          },
          { isolationLevel: 'Serializable' },
        );
      } catch (error: unknown) {
        if (
          (error as { code?: string }).code === PRISMA_SERIALIZATION_FAILURE &&
          attempt < MAX_SERIALIZATION_RETRIES - 1
        )
          continue;
        throw error;
      }
    }
    throw new ConflictException(
      'Concurrent storyboard creation did not settle. Retry with the same request ID.',
    );
  }

  async get(
    organizationId: string,
    brandId: string,
    runId: string,
  ): Promise<StoryboardRun> {
    return projectStoryboardRun(
      (await this.store.read(organizationId, brandId, runId)).record,
    );
  }

  async list(
    organizationId: string,
    brandId: string,
    query: unknown,
  ): Promise<StoryboardRunSummary[]> {
    const input = parseInput(listStoryboardRunsSchema, query);
    const records = await this.prisma.contentRun.findMany({
      select: RUN_SELECT,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      skip: (input.page - 1) * input.limit,
      take: input.limit,
      where: scopedWhere(organizationId, {
        brandId,
        config: { path: ['contract'], equals: STORYBOARD_RUN_CONTRACT },
        ...contentRunTitleSearch(['plan', 'title'], input.search),
      }),
    });
    return records.flatMap((record) => {
      const parsed = storyboardStoredRunConfigSchema.safeParse(record.config);
      if (!parsed.success) {
        this.logger.warn('Skipping malformed storyboard run in list', {
          brandId,
          organizationId,
          runId: record.id,
          issues: parsed.error.issues.map((issue) => issue.message).slice(0, 8),
        });
        return [];
      }
      const config = parsed.data;
      const kind = config.sourceSnapshot.selector.kind;
      return [
        storyboardRunSummarySchema.parse({
          id: record.id,
          brandId: record.brandId,
          title: config.plan.title,
          sourceLabel:
            kind === 'brief'
              ? 'brief'
              : kind === 'uploaded_video'
                ? 'remix_upload'
                : 'remix_discovery',
          shotCount: config.plan.shots.length,
          runtimeSeconds: config.plan.shots.reduce(
            (sum, shot) => sum + (shot.durationSeconds ?? 0),
            0,
          ),
          runtimeBudgetSeconds: config.plan.runtimeBudgetSeconds,
          approvalState:
            config.approvedRevision === config.revision ? 'approved' : 'draft',
          state: config.state,
          updatedAt: record.updatedAt.toISOString(),
        }),
      ];
    });
  }

  async updatePlan(
    organizationId: string,
    brandId: string,
    runId: string,
    body: unknown,
  ): Promise<StoryboardRun> {
    const input = parseInput(updateStoryboardPlanSchema, body);
    const { config } = await this.store.read(
      organizationId,
      brandId,
      runId,
      input.expectedRevision,
    );
    assertStoryboardEditable(config);
    if (input.plan.longForm) {
      // Long-form plans narrate over one presenter track; no video-model
      // durations apply, so timing comes from the narration itself.
      const next = editStoryboardPlan(
        config,
        normalizeStoryboardLongForm(input.plan),
      );
      await this.source.validatePlanAssets(organizationId, brandId, next.plan);
      return this.store.save(organizationId, brandId, runId, config, next);
    }
    const previousPlan = config.plan;
    const previousCapabilities = await this.capabilities.resolve(
      organizationId,
      brandId,
      runId,
      config,
    );
    const nextCapabilities = requiresStoryboardCapabilities(
      previousPlan,
      input.plan,
    )
      ? await this.capabilities.resolve(organizationId, brandId, runId, {
          ...config,
          plan: input.plan,
        })
      : previousCapabilities;
    // The UI acknowledges the saved plan's capability snapshot before requesting a new model/format.
    if (
      input.capabilityVersion &&
      input.capabilityVersion !== previousCapabilities.capabilityVersion
    )
      storyboardCapabilityError(
        'STORYBOARD_CAPABILITIES_CHANGED',
        HttpStatus.CONFLICT,
      );
    const normalized = normalizeStoryboardTiming(
      previousPlan,
      input.plan,
      nextCapabilities,
      input.capabilityVersion ? nextCapabilities.capabilityVersion : undefined,
    );
    const next = editStoryboardPlan(config, normalized);
    await this.source.validatePlanAssets(organizationId, brandId, next.plan);
    return this.store.save(organizationId, brandId, runId, config, next);
  }

  async resetPlan(
    organizationId: string,
    brandId: string,
    runId: string,
    body: unknown,
  ): Promise<StoryboardRun> {
    const input = parseInput(controlStoryboardRunSchema, body);
    const { config } = await this.store.read(
      organizationId,
      brandId,
      runId,
      input.expectedRevision,
    );
    if (!config.generatedPlan)
      throw new ConflictException(
        'This storyboard has no generated plan to restore.',
      );
    const capabilities = await this.capabilities.resolve(
      organizationId,
      brandId,
      runId,
      { ...config, plan: config.generatedPlan },
    );
    const restored = normalizeStoryboardTiming(
      config.plan,
      config.generatedPlan,
      capabilities,
      capabilities.capabilityVersion,
    );
    const next = editStoryboardPlan(config, restored);
    await this.source.validatePlanAssets(organizationId, brandId, next.plan);
    return this.store.save(organizationId, brandId, runId, config, next);
  }

  /**
   * Draft the plan from the brief, or revise the saved plan when an
   * instruction is given. The model call happens before anything is written,
   * so a failed draft leaves the run untouched.
   */
  async draftPlan(
    organizationId: string,
    brandId: string,
    runId: string,
    userId: string,
    body: unknown,
  ): Promise<StoryboardRun> {
    const input = parseInput(draftStoryboardPlanSchema, body);
    const { config } = await this.store.read(
      organizationId,
      brandId,
      runId,
      input.expectedRevision,
    );
    assertStoryboardEditable(config);
    const selector = config.sourceSnapshot.selector;
    // Uploaded and remix sources carry no written brief; analysis builds their plan.
    if (selector.kind !== 'brief')
      throw new BadRequestException(
        'Plan drafting needs a written brief. This storyboard starts from a video, which is analysed instead.',
      );
    const hasShots = config.plan.longForm
      ? config.plan.longForm.segments.length > 0
      : config.plan.shots.some((shot) => shot.action.length > 0);
    const isRevision = Boolean(input.instruction) && hasShots;
    if (!selector.brief && !input.instruction)
      throw new BadRequestException(
        'Write a brief or give an instruction before drafting the plan.',
      );
    if (config.plan.longForm) {
      const context = await this.planning.resolveBrandContext(
        organizationId,
        brandId,
      );
      const plan = await this.drafter.draftLongForm({
        brandId,
        organizationId,
        userId,
        brand: {
          name: context.brand.label,
          description: context.brand.description ?? undefined,
        },
        brief: selector.brief,
        current: config.plan,
        instruction: input.instruction,
        mode: isRevision ? 'revise' : 'draft',
        runtimeBudgetSeconds: storyboardLongFormRuntime(config.plan),
      });
      return this.saveDraftedPlan(
        organizationId,
        brandId,
        runId,
        config,
        plan,
        isRevision,
      );
    }
    const capabilities = await this.capabilities.resolve(
      organizationId,
      brandId,
      runId,
      config,
    );
    if (capabilities.status !== 'available' || !capabilities.effectiveModel)
      storyboardCapabilityError(
        capabilities.reasonCode ?? 'MODEL_CAPABILITIES_UNAVAILABLE',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    const context = await this.planning.resolveBrandContext(
      organizationId,
      brandId,
    );
    const plan = await this.drafter.draft({
      brandId,
      organizationId,
      userId,
      brand: {
        name: context.brand.label,
        description: context.brand.description ?? undefined,
      },
      brief: selector.brief,
      current: config.plan,
      instruction: input.instruction,
      mode: isRevision ? 'revise' : 'draft',
      model: capabilities.effectiveModel,
      runtimeBudgetSeconds:
        config.plan.runtimeBudgetSeconds ??
        STORYBOARD_DEFAULT_RUNTIME_BUDGET_SECONDS,
    });
    return this.saveDraftedPlan(
      organizationId,
      brandId,
      runId,
      config,
      plan,
      isRevision,
    );
  }

  private async saveDraftedPlan(
    organizationId: string,
    brandId: string,
    runId: string,
    config: StoryboardStoredRunConfig,
    plan: StoryboardPlan,
    isRevision: boolean,
  ): Promise<StoryboardRun> {
    const next = editStoryboardPlan(config, plan);
    await this.source.validatePlanAssets(organizationId, brandId, next.plan);
    return this.store.save(
      organizationId,
      brandId,
      runId,
      config,
      // Reset restores the last generated plan; a revision keeps the earlier one.
      isRevision
        ? next
        : storyboardStoredRunConfigSchema.parse({
            ...next,
            generatedPlan: next.plan,
          }),
    );
  }

  async approvePlan(
    organizationId: string,
    brandId: string,
    runId: string,
    body: unknown,
  ): Promise<StoryboardRun> {
    const input = parseInput(controlStoryboardRunSchema, body);
    const { config } = await this.store.read(
      organizationId,
      brandId,
      runId,
      input.expectedRevision,
    );
    await this.source.revalidate(
      organizationId,
      brandId,
      config.sourceSnapshot,
    );
    await this.source.validatePlanAssets(organizationId, brandId, config.plan);
    if (config.plan.longForm)
      return this.store.save(
        organizationId,
        brandId,
        runId,
        config,
        approveStoryboardPlan(config),
      );
    const capabilities = await this.capabilities.resolve(
      organizationId,
      brandId,
      runId,
      config,
    );
    if (capabilities.status !== 'available')
      storyboardCapabilityError(
        capabilities.reasonCode ?? 'MODEL_CAPABILITIES_UNAVAILABLE',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    const normalized = normalizeStoryboardTiming(
      config.plan,
      config.plan,
      capabilities,
      capabilities.capabilityVersion,
      true,
    );
    if (JSON.stringify(normalized.shots) !== JSON.stringify(config.plan.shots))
      storyboardCapabilityError(
        'STORYBOARD_CAPABILITIES_CHANGED',
        HttpStatus.CONFLICT,
      );
    return this.store.save(
      organizationId,
      brandId,
      runId,
      config,
      approveStoryboardPlan(config),
    );
  }

  async updateSource(
    organizationId: string,
    brandId: string,
    runId: string,
    body: unknown,
  ): Promise<StoryboardRun> {
    const input = parseInput(updateStoryboardSourceSchema, body);
    const { config } = await this.store.read(
      organizationId,
      brandId,
      runId,
      input.expectedRevision,
    );
    if (config.scenePipeline)
      throw new ConflictException(
        'Source changes require reconciliation of the existing pipeline before replacement.',
      );
    const sourceSnapshot = await this.source.resolve(
      organizationId,
      brandId,
      input.source,
    );
    const next = editStoryboardPlan(config, config.plan);
    return this.store.save(
      organizationId,
      brandId,
      runId,
      config,
      storyboardStoredRunConfigSchema.parse({
        ...next,
        sourceSnapshot,
        generatedPlan: undefined,
        plan: {
          ...next.plan,
          shots: next.plan.shots.map((shot) => ({
            ...shot,
            stillFreshness: shot.stillAssetId ? 'stale' : 'missing',
          })),
        },
        state:
          input.source.kind === 'brief' ? 'storyboard' : 'awaiting_analysis',
      }),
    );
  }
}
