import { AgentRunsService } from '@api/collections/agent-runs/services/agent-runs.service';
import { CreateCronJobDto } from '@api/collections/cron-jobs/dto/create-cron-job.dto';
import { UpdateCronJobDto } from '@api/collections/cron-jobs/dto/update-cron-job.dto';
import {
  CronJob,
  type CronJobDocument,
  type CronJobType,
} from '@api/collections/cron-jobs/schemas/cron-job.schema';
import {
  CronRun,
  type CronRunDocument,
  type CronRunTrigger,
} from '@api/collections/cron-jobs/schemas/cron-run.schema';
import { WorkflowsService } from '@api/collections/workflows/services/workflows.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { AgentRunQueueService } from '@api/queues/agent-run/agent-run-queue.service';
import { CacheService } from '@api/services/cache/services/cache.service';
import { OpenRouterService } from '@api/services/integrations/openrouter/services/openrouter.service';
import { SubstackService } from '@api/services/integrations/substack/services/substack.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  AgentAutonomyMode,
  AgentExecutionTrigger,
  AgentType,
} from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { CronJob as CronParser } from 'cron';
import { Model, Types } from 'mongoose';

interface NewsletterPayload {
  topic?: string;
  instructions?: string;
  model?: string;
  publicationName?: string;
  sources?: string[];
  webhookUrl?: string;
  webhookSecret?: string;
  webhookHeaders?: Record<string, string>;
}

interface AgentStrategyPayload {
  strategyId?: string;
  objective?: string;
  creditBudget?: number;
  model?: string;
  agentType?: string;
  autonomyMode?: string;
}

export function computeNextRunAtOrThrow(
  schedule: string,
  timezone: string | undefined,
): Date {
  const parser = new CronParser(
    schedule,
    () => undefined,
    null,
    false,
    timezone ?? 'UTC',
  );

  return parser.nextDate().toJSDate();
}

@Injectable()
export class CronJobsService {
  constructor(
    @InjectModel(CronJob.name, DB_CONNECTIONS.CLOUD)
    private readonly cronJobModel: Model<CronJobDocument>,
    @InjectModel(CronRun.name, DB_CONNECTIONS.CLOUD)
    private readonly cronRunModel: Model<CronRunDocument>,
    private readonly prisma: PrismaService,
    private readonly workflowsService: WorkflowsService,
    private readonly agentRunsService: AgentRunsService,
    private readonly agentRunQueueService: AgentRunQueueService,
    private readonly openRouterService: OpenRouterService,
    private readonly substackService: SubstackService,
    private readonly cacheService: CacheService,
    private readonly logger: LoggerService,
  ) {}

  async create(
    userId: string,
    organizationId: string,
    dto: CreateCronJobDto,
  ): Promise<CronJobDocument> {
    this.assertValidSchedule(dto.schedule, dto.timezone);

    return await this.cronJobModel.create({
      enabled: dto.enabled ?? true,
      jobType: dto.jobType,
      lastStatus: 'never',
      name: dto.name,
      nextRunAt: computeNextRunAtOrThrow(dto.schedule, dto.timezone),
      organization: new Types.ObjectId(organizationId),
      payload: dto.payload ?? {},
      schedule: dto.schedule,
      timezone: dto.timezone ?? 'UTC',
      user: new Types.ObjectId(userId),
    });
  }

  async list(
    organizationId: string,
    filters: {
      enabled?: boolean;
      jobType?: string;
    } = {},
  ): Promise<CronJobDocument[]> {
    return await this.cronJobModel
      .find({
        ...(filters.enabled !== undefined ? { enabled: filters.enabled } : {}),
        ...(filters.jobType ? { jobType: filters.jobType } : {}),
        isDeleted: false,
        organization: new Types.ObjectId(organizationId),
      })
      .sort({ createdAt: -1 })
      .exec();
  }

  async findOne(
    id: string,
    organizationId: string,
  ): Promise<CronJobDocument | null> {
    return await this.cronJobModel.findOne({
      _id: id,
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
    });
  }

  async update(
    id: string,
    organizationId: string,
    dto: UpdateCronJobDto,
  ): Promise<CronJobDocument | null> {
    const current = await this.findOne(id, organizationId);
    if (!current) {
      return null;
    }

    const schedule = dto.schedule ?? current.schedule;
    const timezone = dto.timezone ?? current.timezone;
    this.assertValidSchedule(schedule, timezone);

    return await this.cronJobModel.findOneAndUpdate(
      {
        _id: id,
        isDeleted: false,
        organization: new Types.ObjectId(organizationId),
      },
      {
        ...dto,
        nextRunAt: computeNextRunAtOrThrow(schedule, timezone),
      },
      { new: true },
    );
  }

  async pause(
    id: string,
    organizationId: string,
  ): Promise<CronJobDocument | null> {
    return await this.cronJobModel.findOneAndUpdate(
      {
        _id: id,
        isDeleted: false,
        organization: new Types.ObjectId(organizationId),
      },
      { enabled: false },
      { new: true },
    );
  }

  async resume(
    id: string,
    organizationId: string,
  ): Promise<CronJobDocument | null> {
    const current = await this.findOne(id, organizationId);
    if (!current) {
      return null;
    }

    return await this.cronJobModel.findOneAndUpdate(
      {
        _id: id,
        isDeleted: false,
        organization: new Types.ObjectId(organizationId),
      },
      {
        enabled: true,
        nextRunAt: computeNextRunAtOrThrow(current.schedule, current.timezone),
      },
      { new: true },
    );
  }

  async delete(
    id: string,
    organizationId: string,
  ): Promise<CronJobDocument | null> {
    return await this.cronJobModel.findOneAndUpdate(
      {
        _id: id,
        isDeleted: false,
        organization: new Types.ObjectId(organizationId),
      },
      {
        enabled: false,
        isDeleted: true,
      },
      { new: true },
    );
  }

  async getRuns(
    id: string,
    organizationId: string,
  ): Promise<CronRunDocument[]> {
    return await this.cronRunModel
      .find({
        cronJob: new Types.ObjectId(id),
        isDeleted: false,
        organization: new Types.ObjectId(organizationId),
      })
      .sort({ createdAt: -1 })
      .limit(100)
      .exec();
  }

  async getRun(
    jobId: string,
    runId: string,
    organizationId: string,
  ): Promise<CronRunDocument | null> {
    return await this.cronRunModel.findOne({
      _id: runId,
      cronJob: new Types.ObjectId(jobId),
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
    });
  }

  async runNow(
    id: string,
    organizationId: string,
  ): Promise<CronRunDocument | null> {
    const job = await this.findOne(id, organizationId);
    if (!job) {
      return null;
    }

    return await this.executeJob(job, 'manual');
  }

  async processDueJobs(limit = 30): Promise<number> {
    const dueJobs = await this.cronJobModel
      .find({
        enabled: true,
        isDeleted: false,
        nextRunAt: { $lte: new Date() },
      })
      .sort({ nextRunAt: 1 })
      .limit(limit)
      .exec();

    let processed = 0;

    for (const job of dueJobs) {
      const lockKey = `cron-job:lock:${String(job._id)}`;
      const acquired = await this.cacheService.acquireLock(lockKey, 300);

      if (!acquired) {
        continue;
      }

      try {
        await this.executeJob(job, 'scheduled');
        processed += 1;
      } finally {
        await this.cacheService.releaseLock(lockKey);
      }
    }

    return processed;
  }

  private async executeJob(
    job: CronJobDocument,
    trigger: CronRunTrigger,
  ): Promise<CronRunDocument> {
    const start = new Date();

    const run = await this.cronRunModel.create({
      cronJob: job._id,
      organization: job.organization,
      startedAt: start,
      status: 'running',
      trigger,
      user: job.user,
    });

    await this.cronJobModel.updateOne(
      { _id: job._id },
      {
        $set: {
          lastRunAt: start,
          lastStatus: 'running',
        },
      },
    );

    try {
      const artifacts = await this.executeByType(job.jobType, job.payload, job);

      await this.cronRunModel.updateOne(
        { _id: run._id },
        {
          $set: {
            artifacts,
            endedAt: new Date(),
            status: 'success',
          },
        },
      );

      await this.cronJobModel.updateOne(
        { _id: job._id },
        {
          $set: {
            consecutiveFailures: 0,
            lastStatus: 'success',
            nextRunAt: computeNextRunAtOrThrow(job.schedule, job.timezone),
          },
        },
      );

      const updatedRun = await this.cronRunModel.findById(run._id).exec();
      if (!updatedRun) {
        throw new Error('Cron run missing after completion');
      }

      return updatedRun;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';

      this.logger.error('Dynamic cron job execution failed', {
        error: message,
        jobId: String(job._id),
        jobType: job.jobType,
      });

      await this.cronRunModel.updateOne(
        { _id: run._id },
        {
          $set: {
            endedAt: new Date(),
            error: message,
            status: 'failed',
          },
        },
      );

      await this.cronJobModel.updateOne(
        { _id: job._id },
        {
          $inc: { consecutiveFailures: 1 },
          $set: {
            lastStatus: 'failed',
            nextRunAt: computeNextRunAtOrThrow(job.schedule, job.timezone),
          },
        },
      );

      const failedRun = await this.cronRunModel.findById(run._id).exec();
      if (!failedRun) {
        throw new Error('Cron run missing after failure');
      }

      return failedRun;
    }
  }

  private async executeByType(
    jobType: CronJobType,
    payload: Record<string, unknown>,
    job: CronJobDocument,
  ): Promise<Record<string, unknown>> {
    switch (jobType) {
      case 'workflow_execution': {
        const workflowId = String(payload.workflowId ?? '');
        if (!workflowId) {
          throw new Error('workflowId is required for workflow_execution jobs');
        }

        const workflow = await this.workflowsService.findOne({
          _id: workflowId,
          isDeleted: false,
          organization: job.organization,
          user: job.user,
        });
        if (!workflow) {
          throw new Error('Workflow not found for this tenant');
        }

        await this.workflowsService.executeWorkflow(workflowId);
        return { workflowId };
      }

      case 'agent_strategy_execution': {
        return await this.executeAgentStrategy(payload, job);
      }

      case 'newsletter_substack': {
        return await this.generateNewsletterDraft(
          payload as NewsletterPayload,
          job,
        );
      }

      default:
        throw new Error(`Unsupported cron job type: ${jobType}`);
    }
  }

  private async executeAgentStrategy(
    payload: Record<string, unknown>,
    job: CronJobDocument,
  ): Promise<Record<string, unknown>> {
    const typedPayload = payload as AgentStrategyPayload;
    const strategyId = String(typedPayload.strategyId ?? '');

    const strategy = strategyId
      ? await this.prisma.agentStrategy.findFirst({
          where: {
            id: strategyId,
            isDeleted: false,
            organizationId: job.organization.toString(),
            userId: job.user.toString(),
          },
        })
      : null;

    const objective =
      typedPayload.objective ??
      (strategy
        ? `Execute strategy objective for ${strategy.label}`
        : 'Run autonomous agent objective');

    const run = await this.agentRunsService.create({
      creditBudget: typedPayload.creditBudget ?? strategy?.dailyCreditBudget,
      label: strategy
        ? `Cron: ${strategy.label}`
        : `Cron Agent Job: ${job.name}`,
      objective,
      organization: job.organization,
      strategy: strategy?.id,
      trigger: AgentExecutionTrigger.CRON,
      user: job.user,
    });

    await this.agentRunQueueService.queueRun({
      agentType:
        typedPayload.agentType ?? strategy?.agentType ?? AgentType.GENERAL,
      autonomyMode:
        typedPayload.autonomyMode ??
        strategy?.autonomyMode ??
        AgentAutonomyMode.SUPERVISED,
      creditBudget:
        typedPayload.creditBudget ?? strategy?.dailyCreditBudget ?? 50,
      model: typedPayload.model ?? strategy?.model,
      objective,
      organizationId: job.organization.toString(),
      runId: String(run._id),
      strategyId: strategy ? String(strategy.id) : undefined,
      userId: job.user.toString(),
    });

    return {
      agentRunId: String(run._id),
      strategyId: strategy ? String(strategy.id) : null,
    };
  }

  private async generateNewsletterDraft(
    payload: NewsletterPayload,
    job: CronJobDocument,
  ): Promise<Record<string, unknown>> {
    const topic = payload.topic ?? 'Genfeed.ai weekly update';
    const publicationName = payload.publicationName ?? 'Genfeed.ai Newsletter';
    const sourceList = (payload.sources ?? [])
      .map((source) => `- ${source}`)
      .join('\n');

    const prompt = [
      `Write a concise newsletter draft for ${publicationName}.`,
      `Topic: ${topic}.`,
      payload.instructions ? `Instructions: ${payload.instructions}` : '',
      sourceList ? `Sources:\n${sourceList}` : '',
      'Output markdown with: title, intro, 3-5 sections, and CTA.',
    ]
      .filter(Boolean)
      .join('\n\n');

    const model = payload.model ?? 'openai/gpt-4o-mini';

    try {
      const completion = await this.openRouterService.chatCompletion({
        max_tokens: 1200,
        messages: [
          {
            content:
              'You are a senior newsletter editor for Genfeed.ai. Produce factual, clear drafts.',
            role: 'system',
          },
          { content: prompt, role: 'user' },
        ],
        model,
        temperature: 0.6,
      });

      const draftContent = completion.choices?.[0]?.message?.content;
      const draftTitle = this.resolveDraftTitle(topic, draftContent);
      const substackResult = await this.substackService.createDraft({
        markdown:
          draftContent ?? 'Newsletter draft generation returned empty content.',
        publication: publicationName,
        title: draftTitle,
      });
      const delivery = await this.substackService.deliverDraftWebhook({
        payload: {
          event: 'newsletter.draft.ready',
          jobId: String(job._id),
          markdown:
            draftContent ??
            'Newsletter draft generation returned empty content.',
          publicationName,
          substack: substackResult,
          title: draftTitle,
          topic,
        },
        webhookHeaders: payload.webhookHeaders,
        webhookSecret: payload.webhookSecret,
        webhookUrl: payload.webhookUrl,
      });

      return {
        delivery,
        draft:
          draftContent ?? 'Newsletter draft generation returned empty content.',
        draftTitle,
        jobId: String(job._id),
        model,
        publicationName,
        sources: payload.sources ?? [],
        status: 'draft_created',
        substack: substackResult,
        topic,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';

      return {
        delivery: await this.substackService.deliverDraftWebhook({
          payload: {
            event: 'newsletter.draft.ready',
            fallback: true,
            jobId: String(job._id),
            markdown: `# ${topic}\n\nFallback draft generated by cron job ${String(job._id)}.`,
            publicationName,
            title: topic,
            topic,
          },
          webhookHeaders: payload.webhookHeaders,
          webhookSecret: payload.webhookSecret,
          webhookUrl: payload.webhookUrl,
        }),
        draft: `# ${topic}\n\nThis is a fallback newsletter draft generated without model output.\n\nSources:\n${sourceList || '- No sources provided'}`,
        generationError: message,
        model,
        publicationName,
        sources: payload.sources ?? [],
        status: 'draft_created_fallback',
        substack: await this.substackService.createDraft({
          markdown: `# ${topic}\n\nFallback draft generated by cron job ${String(job._id)}.`,
          publication: publicationName,
          title: topic,
        }),
        topic,
      };
    }
  }

  private resolveDraftTitle(
    topic: string,
    draftContent: string | null,
  ): string {
    const firstLine = draftContent?.split('\n')[0]?.replace(/^#\s*/, '').trim();
    return firstLine || topic;
  }

  private assertValidSchedule(
    schedule: string,
    timezone: string | undefined,
  ): void {
    try {
      computeNextRunAtOrThrow(schedule, timezone);
    } catch {
      throw new BadRequestException('Invalid cron schedule or timezone');
    }
  }
}
