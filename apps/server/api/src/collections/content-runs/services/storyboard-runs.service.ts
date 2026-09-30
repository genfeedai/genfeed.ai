import { createHash, randomUUID } from 'node:crypto';
import { toBrandGenerationReferences } from '@api/collections/brands/utils/brand-kit-generation-references.util';
import { BrandRemixRunPlanningService } from '@api/collections/content-runs/services/brand-remix-run-planning.service';
import {
  MAX_SERIALIZATION_RETRIES,
  PRISMA_SERIALIZATION_FAILURE,
  RUN_SELECT,
} from '@api/collections/content-runs/services/brand-remix-runs.types';
import {
  normalizeStoryboardTiming,
  requiresStoryboardCapabilities,
  storyboardCapabilityError,
} from '@api/collections/content-runs/services/storyboard-plan-capabilities';
import {
  approveStoryboardPlan,
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
  storyboardPlanSchema,
  updateStoryboardPlanSchema,
} from '@genfeedai/contracts/api-types/contracts/storyboard-plan.contract';
import {
  controlStoryboardRunSchema,
  createStoryboardRunSchema,
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
    .sort(([left], [right]) => left.localeCompare(right))
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
            const settings = input.planSettings ?? {
              videoModelKey: null,
              format: '9:16' as const,
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
              shots: seedImageAssetId
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
      }),
    });
    return records.map((record) => {
      const config = storyboardRunConfigSchema.parse(record.config);
      const kind = config.sourceSnapshot.selector.kind;
      return storyboardRunSummarySchema.parse({
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
      });
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
    const previousCapabilities = await this.capabilities.resolve(
      organizationId,
      brandId,
      runId,
      config,
    );
    const nextCapabilities = requiresStoryboardCapabilities(
      config.plan,
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
      config.plan,
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
    return this.store.save(organizationId, brandId, runId, config, {
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
      state: input.source.kind === 'brief' ? 'storyboard' : 'awaiting_analysis',
    });
  }
}
