import type { BrandDocument } from '@api/collections/brands/schemas/brand.schema';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CacheService } from '@api/services/cache/services/cache.service';
import { ContentExecutionService } from '@api/services/content-engine/content-execution.service';
import { ContentPlannerService } from '@api/services/content-engine/content-planner.service';
import { ContentOrchestrationService } from '@api/services/content-orchestration/content-orchestration.service';
import { ContentPipelineQueueService } from '@api/services/content-orchestration/content-pipeline-queue.service';
import type { PipelineStep } from '@api/services/content-orchestration/pipeline.interfaces';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  ImageTaskModel,
  MusicTaskModel,
  PersonaContentFormat,
  PersonaStatus,
  VideoTaskModel,
} from '@genfeedai/enums';
import type { Credential, Persona } from '@genfeedai/prisma';
import { scopedWhere } from '@genfeedai/server';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

const MAX_BRANDS_PER_CYCLE = 10;
const MAX_PERSONAS_PER_CYCLE = 20;
const FIFTEEN_MINUTES_SECONDS = 900;

type ContentProductionAction =
  | 'contentEngineProduction'
  | 'contentPipelineAutopilot';

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

type PersonaWithCredentials = Persona & {
  config: PersonaConfig;
  credentials: Credential[];
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
    private readonly contentPipelineQueueService: ContentPipelineQueueService,
    private readonly cacheService: CacheService,
    private readonly logger: LoggerService,
  ) {}

  async runContentEngineProduction(
    organizationId: string,
  ): Promise<ContentProductionWorkflowResult> {
    const action: ContentProductionAction = 'contentEngineProduction';
    const lockKey = this.lockKey(action, organizationId);
    const acquired = await this.cacheService.acquireLock(
      lockKey,
      FIFTEEN_MINUTES_SECONDS,
    );

    if (!acquired) {
      return this.skipped(
        action,
        organizationId,
        'content_engine_already_running',
      );
    }

    let processed = 0;
    let skipped = 0;
    let failed = 0;

    try {
      const brands =
        await this.brandsService.findForOrganization(organizationId);
      const eligibleBrands = brands
        .filter((brand) => {
          if (brand.isActive !== true) {
            return false;
          }
          const agentConfig = this.readRecord(brand.agentConfig);
          const autoPublish = this.readRecord(agentConfig.autoPublish);
          const strategy = this.readRecord(agentConfig.strategy);
          return (
            autoPublish.enabled === true &&
            Array.isArray(strategy.contentTypes) &&
            strategy.contentTypes.length > 0
          );
        })
        .slice(0, MAX_BRANDS_PER_CYCLE);

      skipped = Math.max(brands.length - eligibleBrands.length, 0);

      for (const brand of eligibleBrands) {
        try {
          await this.processBrand(brand, organizationId);
          processed += 1;
        } catch (error: unknown) {
          failed += 1;
          this.logger.error(`${this.logContext} brand content engine failed`, {
            brandId: this.optionalString(brand.id),
            error: this.errorMessage(error),
            organizationId,
          });
        }
      }

      return {
        action,
        failed,
        organizationId,
        processed,
        skipped,
        status: 'completed',
      };
    } finally {
      await this.cacheService.releaseLock(lockKey);
    }
  }

  async runContentPipelineAutopilot(
    organizationId: string,
  ): Promise<ContentProductionWorkflowResult> {
    const action: ContentProductionAction = 'contentPipelineAutopilot';
    const lockKey = this.lockKey(action, organizationId);
    const acquired = await this.cacheService.acquireLock(
      lockKey,
      FIFTEEN_MINUTES_SECONDS,
    );

    if (!acquired) {
      return this.skipped(
        action,
        organizationId,
        'content_pipeline_already_running',
      );
    }

    let processed = 0;
    let skipped = 0;
    let failed = 0;

    try {
      const now = new Date();
      const duePersonas = (await this.prisma.persona.findMany({
        include: { credentials: true },
        take: MAX_PERSONAS_PER_CYCLE,
        where: scopedWhere(organizationId, {
          isAutopilotEnabled: true,
          nextAutopilotRunAt: { lte: now },
          status: PersonaStatus.ACTIVE as never,
        }),
      })) as PersonaWithCredentials[];

      for (const persona of duePersonas) {
        try {
          const queued = await this.processPersona(persona, now);
          if (queued) {
            processed += 1;
          } else {
            skipped += 1;
          }
        } catch (error: unknown) {
          failed += 1;
          this.logger.error(`${this.logContext} persona autopilot failed`, {
            error: this.errorMessage(error),
            organizationId,
            personaId: persona.id,
          });
        }
      }

      return {
        action,
        failed,
        organizationId,
        processed,
        skipped,
        status: 'completed',
      };
    } finally {
      await this.cacheService.releaseLock(lockKey);
    }
  }

  private async processBrand(
    brand: BrandDocument,
    organizationId: string,
  ): Promise<void> {
    const brandId = String(brand.id);
    const userId = this.optionalString(brand.userId);
    if (!userId) {
      throw new Error(`Brand ${brandId} has no canonical user owner`);
    }
    const strategy = this.readRecord(
      this.readRecord(brand.agentConfig).strategy,
    );
    const contentTypes = strategy.contentTypes;

    if (!Array.isArray(contentTypes) || contentTypes.length === 0) {
      return;
    }

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

    await this.contentExecutionService.executePlan(
      organizationId,
      brandId,
      String(plan.id),
      userId,
    );
  }

  private async processPersona(
    persona: PersonaWithCredentials,
    now: Date,
  ): Promise<boolean> {
    const personaId = persona.id;
    const config = (persona.config ?? {}) as PersonaConfig;

    if (!persona.credentials || persona.credentials.length === 0) {
      await this.scheduleNextRun(persona, now, false);
      return false;
    }

    if (!config.profileImageUrl) {
      await this.scheduleNextRun(persona, now, false);
      return false;
    }

    const prompt = this.buildPromptFromStrategy(persona);
    const steps = this.buildStepsFromStrategy(persona, prompt);

    await this.contentPipelineQueueService.queueGenerateAndPublish({
      brandId: persona.brandId ?? '',
      idempotencyKey: `autopilot-${personaId}-${now.toISOString().slice(0, 13)}`,
      organizationId: persona.organizationId,
      personaId,
      platforms: config.contentStrategy?.platforms,
      prompt,
      steps,
      userId: persona.userId,
    });

    await this.scheduleNextRun(persona, now);
    return true;
  }

  private buildPromptFromStrategy(persona: PersonaWithCredentials): string {
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
    persona: PersonaWithCredentials,
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
    persona: PersonaWithCredentials,
    now: Date,
    updateLastRun = true,
  ): Promise<void> {
    const config = (persona.config ?? {}) as PersonaConfig;
    const frequencyMs = ContentOrchestrationService.parseFrequencyToMs(
      config.contentStrategy?.frequency,
    );
    const nextRun = new Date(now.getTime() + frequencyMs);

    const updatedConfig: PersonaConfig = {
      ...config,
      ...(updateLastRun ? { lastAutopilotRunAt: now.toISOString() } : {}),
    };

    await this.prisma.persona.update({
      data: {
        config: updatedConfig as never,
        nextAutopilotRunAt: nextRun,
      },
      where: { id: persona.id },
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
}
