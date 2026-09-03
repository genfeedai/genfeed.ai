import { BrandsService } from '@api/collections/brands/services/brands.service';
import { AUTOMATION_WORKFLOW_IDS } from '@api/collections/workflows/services/automation-workflow-definitions';
import { parseFrequencyToMs } from '@api/helpers/utils/content-frequency/content-frequency.util';
import { scopedWhere } from '@api/index';
import { CacheService } from '@api/services/cache/cache.service';
import { ContentExecutionService } from '@api/services/content-engine/content-execution.service';
import { ContentPlannerService } from '@api/services/content-engine/content-planner.service';
import type { PipelineStep } from '@api/services/content-orchestration/pipeline.interfaces';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  ImageTaskModel,
  MusicTaskModel,
  PersonaContentFormat,
  PersonaStatus,
  VideoTaskModel,
} from '@genfeedai/contracts';
import { toPrismaJson } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

const MAX_BRANDS_PER_CYCLE = 10;
const MAX_PERSONAS_PER_CYCLE = 20;
const FIFTEEN_MINUTES_SECONDS = 900;

type ContentProductionAction =
  | typeof AUTOMATION_WORKFLOW_IDS.CONTENT_ENGINE
  | typeof AUTOMATION_WORKFLOW_IDS.CONTENT_PIPELINE;

type PersonaContentStrategy = {
  formats?: PersonaContentFormat[];
  frequency?: string;
  platforms?: string[];
  tone?: string;
  topics?: string[];
};

type PersonaConfig = {
  contentStrategy?: PersonaContentStrategy;
  lastAutopilotRunAt?: string;
  profileImageUrl?: string;
};

type ContentEngineBrandSnapshot = {
  agentConfig: Record<string, unknown>;
  id: string;
  userId?: string;
};

type PersonaSnapshot = {
  brandId?: string;
  config: PersonaConfig;
  credentialCount: number;
  id: string;
  label: string;
  organizationId: string;
  userId: string;
};

export interface ContentProductionWorkflowResult {
  action: ContentProductionAction;
  failed: number;
  organizationId: string;
  processed: number;
  reason?: string;
  skipped: number;
  status: 'completed' | 'skipped';
}

@Injectable()
export class ContentProductionWorkflowService {
  private readonly logContext = 'ContentProductionWorkflowService';

  constructor(
    private readonly brandsService: BrandsService,
    private readonly contentPlannerService: ContentPlannerService,
    private readonly contentExecutionService: ContentExecutionService,
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
    private readonly logger: LoggerService,
  ) {}

  async beginContentEngineProduction(
    organizationId: string,
  ): Promise<Record<string, unknown>> {
    const action = AUTOMATION_WORKFLOW_IDS.CONTENT_ENGINE;
    const lockKey = this.lockKey(action, organizationId);
    const acquired = await this.cacheService.acquireLock(
      lockKey,
      FIFTEEN_MINUTES_SECONDS,
    );
    return { acquired, lockKey, organizationId };
  }

  async discoverContentEngineBrands(
    organizationId: string,
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    if (this.readRecord(input.state).acquired !== true) {
      return { baseInput: { organizationId }, items: [], skipped: 0 };
    }
    const brands = await this.brandsService.findForOrganization(organizationId);
    const items = brands
      .filter((brand) => {
        if (brand.isActive !== true) return false;
        const agentConfig = this.readRecord(brand.agentConfig);
        const autoPublish = this.readRecord(agentConfig.autoPublish);
        const strategy = this.readRecord(agentConfig.strategy);
        return (
          autoPublish.enabled === true &&
          Array.isArray(strategy.contentTypes) &&
          strategy.contentTypes.length > 0
        );
      })
      .slice(0, MAX_BRANDS_PER_CYCLE)
      .map(
        (brand): ContentEngineBrandSnapshot => ({
          agentConfig: this.readRecord(brand.agentConfig),
          id: String(brand.id),
          ...(this.optionalString(brand.userId)
            ? { userId: String(brand.userId) }
            : {}),
        }),
      );
    return {
      baseInput: { organizationId },
      items,
      skipped: Math.max(brands.length - items.length, 0),
    };
  }

  async planContentEngineBrand(
    organizationId: string,
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const brand = this.readRecord(
      input.item,
    ) as unknown as ContentEngineBrandSnapshot;
    try {
      const brandId = String(brand.id);
      const userId = this.optionalString(brand.userId);
      if (!userId)
        throw new Error(`Brand ${brandId} has no canonical user owner`);
      const strategy = this.readRecord(
        this.readRecord(brand.agentConfig).strategy,
      );
      const now = new Date();
      const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const { plan } = await this.contentPlannerService.generatePlan(
        organizationId,
        brandId,
        userId,
        {
          itemCount: 5,
          periodEnd: weekFromNow.toISOString(),
          periodStart: now.toISOString(),
          platforms: this.stringArray(strategy.platforms),
          topics: this.stringArray(strategy.goals),
        },
      );
      return {
        brandId,
        organizationId,
        planId: String(plan.id),
        status: 'planned',
        userId,
      };
    } catch (error) {
      this.logger.error(`${this.logContext} brand content planning failed`, {
        error,
        organizationId,
      });
      return {
        error: this.errorMessage(error),
        organizationId,
        status: 'failed',
      };
    }
  }

  async prepareContentEnginePlanExecution(
    organizationId: string,
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const request = this.readRecord(input.request);
    return this.contentExecutionService.preparePlanExecution(
      organizationId,
      this.requiredString(request.brandId, 'brandId'),
      this.requiredString(request.planId, 'planId'),
      this.requiredString(request.userId, 'userId'),
    );
  }

  async prepareContentEnginePlanItem(
    organizationId: string,
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const item = this.readRecord(input.item);
    return this.contentExecutionService.preparePlanItem(
      organizationId,
      this.requiredString(input.brandId, 'brandId'),
      this.requiredString(input.userId, 'userId'),
      this.requiredString(item.id, 'item.id'),
    );
  }

  async runContentEngineSkillItem(
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return this.contentExecutionService.runSkillItem(
      this.readRecord(input.state) as never,
    );
  }

  async persistContentEngineSkillItem(
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return this.contentExecutionService.persistSkillItem(
      this.readRecord(input.state) as never,
    );
  }

  async executeContentEngineMediaqueryItem(
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const result = await this.contentExecutionService.executeMediaqueryItem(
      this.readRecord(input.state) as never,
    );
    return { ...result };
  }

  async finalizeContentEnginePlan(
    organizationId: string,
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const state = this.readRecord(input.state);
    const result = await this.contentExecutionService.finalizePlanExecution(
      organizationId,
      this.requiredString(state.brandId, 'brandId'),
      this.requiredString(state.planId, 'planId'),
      input.batch,
    );
    return { ...result, status: 'processed' };
  }

  async beginContentPipelineAutopilot(
    organizationId: string,
  ): Promise<Record<string, unknown>> {
    const action = AUTOMATION_WORKFLOW_IDS.CONTENT_PIPELINE;
    const lockKey = this.lockKey(action, organizationId);
    const acquired = await this.cacheService.acquireLock(
      lockKey,
      FIFTEEN_MINUTES_SECONDS,
    );
    return { acquired, lockKey, organizationId };
  }

  async discoverContentPipelinePersonas(
    organizationId: string,
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    if (this.readRecord(input.state).acquired !== true) {
      return { baseInput: { organizationId }, items: [] };
    }
    const now = new Date();
    const personas = await this.prisma.persona.findMany({
      select: {
        _count: { select: { credentials: true } },
        brandId: true,
        config: true,
        id: true,
        label: true,
        organizationId: true,
        userId: true,
      },
      take: MAX_PERSONAS_PER_CYCLE,
      where: scopedWhere(organizationId, {
        isAutopilotEnabled: true,
        nextAutopilotRunAt: { lte: now },
        status: PersonaStatus.ACTIVE,
      }),
    });
    const items = personas.map(
      (persona): PersonaSnapshot => ({
        ...(persona.brandId ? { brandId: persona.brandId } : {}),
        config: this.readRecord(persona.config) as PersonaConfig,
        credentialCount: persona._count.credentials,
        id: persona.id,
        label: persona.label,
        organizationId: persona.organizationId,
        userId: persona.userId,
      }),
    );
    return { baseInput: { now: now.toISOString(), organizationId }, items };
  }

  async prepareContentPipelinePersona(
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const persona = this.readRecord(input.item) as unknown as PersonaSnapshot;
    const now = new Date(this.requiredString(input.now, 'now'));
    const personaId = persona.id;
    const config = (persona.config ?? {}) as PersonaConfig;
    if (persona.credentialCount < 1 || !config.profileImageUrl) {
      return {
        imageItems: [],
        musicItems: [],
        now: now.toISOString(),
        persona,
        personaId,
        status: 'skipped',
        videoItems: [],
      };
    }
    const prompt = this.buildPromptFromStrategy(persona);
    const step = this.buildStepsFromStrategy(persona, prompt)[0];
    if (!step) {
      throw new Error(`Persona ${personaId} has no generation step`);
    }
    const pipelineRequest = {
      brandId: persona.brandId ?? '',
      idempotencyKey: `autopilot-${personaId}-${now.toISOString().slice(0, 13)}`,
      organizationId: persona.organizationId,
      personaId,
      platforms: config.contentStrategy?.platforms,
      prompt,
      publishMode: 'final',
      step,
      stepIndex: 0,
      userId: persona.userId,
    };
    return {
      imageItems: step.type === 'text-to-image' ? [pipelineRequest] : [],
      musicItems: step.type === 'text-to-music' ? [pipelineRequest] : [],
      now: now.toISOString(),
      persona,
      personaId,
      status: 'prepared',
      videoItems: step.type === 'image-to-video' ? [pipelineRequest] : [],
    };
  }

  async scheduleContentPipelinePersona(
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const state = this.readRecord(input.state);
    const persona = state.persona as PersonaSnapshot | undefined;
    if (!persona) {
      throw new Error('persona is required');
    }
    const now = new Date(this.requiredString(state.now, 'now'));
    const generated = ['imageBatch', 'musicBatch', 'videoBatch'].some(
      (key) => this.readBatchResults(input[key]).length > 0,
    );
    await this.scheduleNextRun(persona, now, generated);
    return {
      personaId: persona.id,
      status: generated ? 'processed' : 'skipped',
    };
  }

  async finalizeContentProduction(
    action: ContentProductionAction,
    organizationId: string,
    input: Record<string, unknown>,
  ): Promise<ContentProductionWorkflowResult> {
    const state = this.readRecord(input.state);
    const discovery = this.readRecord(input.discovery);
    const results = this.readBatchResults(input.batch).map((entry) =>
      this.readRecord(entry.result),
    );
    if (state.acquired === true)
      await this.cacheService.releaseLock(this.lockKey(action, organizationId));
    if (state.acquired !== true) {
      return this.skipped(
        action,
        organizationId,
        action === AUTOMATION_WORKFLOW_IDS.CONTENT_ENGINE
          ? 'content_engine_already_running'
          : 'content_pipeline_already_running',
      );
    }
    return {
      action,
      failed: results.filter((result) => result.status === 'failed').length,
      organizationId,
      processed: results.filter((result) => result.status === 'processed')
        .length,
      skipped:
        (typeof discovery.skipped === 'number' ? discovery.skipped : 0) +
        results.filter((result) => result.status === 'skipped').length,
      status: 'completed',
    };
  }

  async failContentProduction(
    action: ContentProductionAction,
    organizationId: string,
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const acquired = this.readRecord(input.state).acquired === true;
    if (acquired)
      await this.cacheService.releaseLock(this.lockKey(action, organizationId));
    return { organizationId, released: acquired };
  }

  private buildPromptFromStrategy(persona: PersonaSnapshot): string {
    const config = (persona.config ?? {}) as PersonaConfig;
    const strategy = config.contentStrategy;
    if (!strategy?.topics?.length) {
      return `Create engaging content for ${persona.label}`;
    }

    const topic =
      strategy.topics[Math.floor(Math.random() * strategy.topics.length)];
    const tone = strategy.tone ?? 'engaging';

    return `Create a ${tone} video about: ${topic}`;
  }

  private buildStepsFromStrategy(
    persona: PersonaSnapshot,
    prompt: string,
  ): PipelineStep[] {
    const config = (persona.config ?? {}) as PersonaConfig;
    const formats = config.contentStrategy?.formats ?? [];

    if (
      formats.includes(PersonaContentFormat.VIDEO) ||
      formats.includes(PersonaContentFormat.REEL)
    ) {
      return [
        {
          imageUrl: config.profileImageUrl,
          model: VideoTaskModel.KLINGAI,
          prompt,
          type: 'image-to-video',
        },
      ];
    }

    if (formats.includes(PersonaContentFormat.AUDIO)) {
      return [
        {
          duration: 8,
          model: MusicTaskModel.REPLICATE,
          prompt,
          type: 'text-to-music',
        },
      ];
    }

    return [
      {
        model: ImageTaskModel.FAL,
        prompt,
        type: 'text-to-image',
      },
    ];
  }

  private async scheduleNextRun(
    persona: PersonaSnapshot,
    now: Date,
    updateLastRun = true,
  ): Promise<void> {
    const config = (persona.config ?? {}) as PersonaConfig;
    const frequencyMs = parseFrequencyToMs(config.contentStrategy?.frequency);
    const nextRun = new Date(now.getTime() + frequencyMs);

    const updatedConfig: PersonaConfig = {
      ...config,
      ...(updateLastRun ? { lastAutopilotRunAt: now.toISOString() } : {}),
    };

    await this.prisma.persona.update({
      data: {
        config: toPrismaJson(updatedConfig),
        nextAutopilotRunAt: nextRun,
      },
      where: scopedWhere(persona.organizationId, { id: persona.id }),
    });
  }

  private lockKey(
    action: ContentProductionAction,
    organizationId: string,
    suffix?: string,
  ): string {
    return ['workflow-content-production', action, organizationId, suffix]
      .filter((part): part is string => Boolean(part))
      .join(':');
  }

  private skipped(
    action: ContentProductionAction,
    organizationId: string,
    reason: string,
  ): ContentProductionWorkflowResult {
    return {
      action,
      failed: 0,
      organizationId,
      processed: 0,
      reason,
      skipped: 1,
      status: 'skipped',
    };
  }

  private readRecord(value: unknown): Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private stringArray(value: unknown): string[] | undefined {
    if (!Array.isArray(value)) {
      return undefined;
    }
    const strings = value.filter(
      (entry): entry is string => typeof entry === 'string',
    );
    return strings.length > 0 ? strings : undefined;
  }

  private optionalString(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Unknown error';
  }

  private readBatchResults(value: unknown): Array<{ result?: unknown }> {
    const batch = this.readRecord(value);
    return Array.isArray(batch.results)
      ? (batch.results as Array<{ result?: unknown }>)
      : [];
  }

  private requiredString(value: unknown, field: string): string {
    if (typeof value !== 'string' || value.length === 0)
      throw new Error(`${field} is required`);
    return value;
  }
}
