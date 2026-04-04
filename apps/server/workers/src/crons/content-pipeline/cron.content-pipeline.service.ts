import {
  Persona,
  type PersonaDocument,
} from '@api/collections/personas/schemas/persona.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { CacheService } from '@api/services/cache/services/cache.service';
import { ContentOrchestrationService } from '@api/services/content-orchestration/content-orchestration.service';
import { ContentPipelineQueueService } from '@api/services/content-orchestration/content-pipeline-queue.service';
import type { PipelineStep } from '@api/services/content-orchestration/pipeline.interfaces';
import {
  ImageTaskModel,
  MusicTaskModel,
  PersonaContentFormat,
  PersonaStatus,
  VideoTaskModel,
} from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Model } from 'mongoose';

const MAX_PERSONAS_PER_CYCLE = 20;

@Injectable()
export class CronContentPipelineService {
  private static readonly LOCK_KEY = 'cron:content-pipeline';
  private static readonly LOCK_TTL_SECONDS = 900; // 15 minutes

  constructor(
    @InjectModel(Persona.name, DB_CONNECTIONS.CLOUD)
    private readonly personaModel: Model<PersonaDocument>,
    private readonly contentPipelineQueueService: ContentPipelineQueueService,
    private readonly cacheService: CacheService,
    private readonly logger: LoggerService,
  ) {}

  @Cron(CronExpression.EVERY_30_MINUTES)
  async processAutopilotPersonas(): Promise<void> {
    const acquired = await this.cacheService.acquireLock(
      CronContentPipelineService.LOCK_KEY,
      CronContentPipelineService.LOCK_TTL_SECONDS,
    );

    if (!acquired) {
      return void this.logger.debug(
        'Content pipeline cron already running (lock held), skipping',
        'CronContentPipelineService',
      );
    }

    const startTime = Date.now();

    try {
      this.logger.log(
        'Starting autopilot content pipeline cycle',
        'CronContentPipelineService',
      );

      const now = new Date();

      const duePersonas = await this.personaModel
        .find({
          isAutopilotEnabled: true,
          isDeleted: false,
          nextAutopilotRunAt: { $lte: now },
          status: PersonaStatus.ACTIVE,
        })
        .limit(MAX_PERSONAS_PER_CYCLE)
        .exec();

      this.logger.log(
        `Found ${duePersonas.length} personas due for autopilot`,
        'CronContentPipelineService',
      );

      for (const persona of duePersonas) {
        try {
          await this.processPersona(persona, now);
        } catch (error: unknown) {
          const message =
            error instanceof Error ? error.message : 'Unknown error';
          this.logger.error(
            `Persona ${String(persona._id)} autopilot failed: ${message}`,
            'CronContentPipelineService',
          );
        }
      }

      const duration = Date.now() - startTime;
      this.logger.log(
        `Autopilot cycle completed in ${duration}ms (${duePersonas.length} personas)`,
        'CronContentPipelineService',
      );
    } catch (error: unknown) {
      this.logger.error(
        'Autopilot content pipeline cycle failed',
        error,
        'CronContentPipelineService',
      );
    } finally {
      await this.cacheService.releaseLock(CronContentPipelineService.LOCK_KEY);
    }
  }

  private async processPersona(
    persona: PersonaDocument,
    now: Date,
  ): Promise<void> {
    const personaId = String(persona._id);

    if (!persona.credentials || persona.credentials.length === 0) {
      this.logger.debug(
        `Persona ${personaId} has no credentials, skipping`,
        'CronContentPipelineService',
      );
      await this.scheduleNextRun(persona, now, false);
      return;
    }

    if (!persona.profileImageUrl) {
      this.logger.debug(
        `Persona ${personaId} has no profileImageUrl for I2V source, skipping`,
        'CronContentPipelineService',
      );
      await this.scheduleNextRun(persona, now, false);
      return;
    }

    const prompt = this.buildPromptFromStrategy(persona);
    const steps = this.buildStepsFromStrategy(persona, prompt);

    await this.contentPipelineQueueService.queueGenerateAndPublish({
      brandId: persona.brand.toString(),
      idempotencyKey: `autopilot:${personaId}:${now.toISOString().slice(0, 13)}`,
      organizationId: persona.organization.toString(),
      personaId,
      platforms: persona.contentStrategy?.platforms,
      prompt,
      steps,
      userId: persona.user.toString(),
    });

    this.logger.log(
      `Queued autopilot pipeline for persona ${personaId}`,
      'CronContentPipelineService',
    );

    await this.scheduleNextRun(persona, now);
  }

  private buildPromptFromStrategy(persona: PersonaDocument): string {
    const strategy = persona.contentStrategy;
    if (!strategy?.topics?.length) {
      return `Create engaging content for ${persona.label}`;
    }

    const topic =
      strategy.topics[Math.floor(Math.random() * strategy.topics.length)];
    const tone = strategy.tone ?? 'engaging';

    return `Create a ${tone} video about: ${topic}`;
  }

  private buildStepsFromStrategy(
    persona: PersonaDocument,
    prompt: string,
  ): PipelineStep[] {
    const formats = persona.contentStrategy?.formats ?? [];

    if (
      formats.includes(PersonaContentFormat.VIDEO) ||
      formats.includes(PersonaContentFormat.REEL)
    ) {
      return [
        {
          imageUrl: persona.profileImageUrl,
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
    persona: PersonaDocument,
    now: Date,
    updateLastRun = true,
  ): Promise<void> {
    const frequencyMs = ContentOrchestrationService.parseFrequencyToMs(
      persona.contentStrategy?.frequency,
    );
    const nextRun = new Date(now.getTime() + frequencyMs);

    const $set: Record<string, unknown> = { nextAutopilotRunAt: nextRun };
    if (updateLastRun) {
      $set.lastAutopilotRunAt = now;
    }

    await this.personaModel.updateOne({ _id: persona._id }, { $set });
  }
}
