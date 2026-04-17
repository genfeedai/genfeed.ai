import { AgentRunsService } from '@api/collections/agent-runs/services/agent-runs.service';
import { CreateCronJobDto } from '@api/collections/cron-jobs/dto/create-cron-job.dto';
import { UpdateCronJobDto } from '@api/collections/cron-jobs/dto/update-cron-job.dto';
import type {
  CronJobDocument,
  CronJobType,
} from '@api/collections/cron-jobs/schemas/cron-job.schema';
import type {
  CronRunDocument,
  CronRunTrigger,
} from '@api/collections/cron-jobs/schemas/cron-run.schema';
import { WorkflowsService } from '@api/collections/workflows/services/workflows.service';
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
import { CronJob as CronParser } from 'cron';

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

    return (await this.prisma.cronJob.create({
      data: {
        enabled: dto.enabled ?? true,
        jobType: dto.jobType,
        lastStatus: 'never',
        name: dto.name,
        nextRunAt: computeNextRunAtOrThrow(dto.schedule, dto.timezone),
        organizationId,
        payload: dto.payload ?? {},
        schedule: dto.schedule,
        timezone: dto.timezone ?? 'UTC',
        userId,
      },
    })) as unknown as CronJobDocument;
  }

  async list(
    organizationId: string,
    filters: {
      enabled?: boolean;
      jobType?: string;
    } = {},
  ): Promise<CronJobDocument[]> {
    return (await this.prisma.cronJob.findMany({
      orderBy: { createdAt: 'desc' },
      where: {
        ...(filters.enabled !== undefined ? { enabled: filters.enabled } : {}),
        ...(filters.jobType ? { jobType: filters.jobType } : {}),
        isDeleted: false,
        organizationId,
      },
    })) as unknown as CronJobDocument[];
  }

  async findOne(
    id: string,
    organizationId: string,
  ): Promise<CronJobDocument | null> {
    return (await this.prisma.cronJob.findFirst({
      where: {
        id,
        isDeleted: false,
        organizationId,
      },
    })) as unknown as CronJobDocument | null;
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

    return (await this.prisma.cronJob.update({
      data: {
        ...dto,
        nextRunAt: computeNextRunAtOrThrow(schedule, timezone),
      },
      where: { id },
    })) as unknown as CronJobDocument;
  }

  async pause(
    id: string,
    organizationId: string,
  ): Promise<CronJobDocument | null> {
    const existing = await this.findOne(id, organizationId);
    if (!existing) return null;

    return (await this.prisma.cronJob.update({
      data: { enabled: false },
      where: { id },
    })) as unknown as CronJobDocument;
  }

  async resume(
    id: string,
    organizationId: string,
  ): Promise<CronJobDocument | null> {
    const current = await this.findOne(id, organizationId);
    if (!current) {
      return null;
    }

    return (await this.prisma.cronJob.update({
      data: {
        enabled: true,
        nextRunAt: computeNextRunAtOrThrow(current.schedule, current.timezone),
      },
      where: { id },
    })) as unknown as CronJobDocument;
  }

  async delete(
    id: string,
    organizationId: string,
  ): Promise<CronJobDocument | null> {
    const existing = await this.findOne(id, organizationId);
    if (!existing) return null;

    return (await this.prisma.cronJob.update({
      data: {
        enabled: false,
        isDeleted: true,
      },
      where: { id },
    })) as unknown as CronJobDocument;
  }

  async getRuns(
    id: string,
    organizationId: string,
  ): Promise<CronRunDocument[]> {
    return (await this.prisma.cronRun.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      where: {
        cronJobId: id,
        isDeleted: false,
        organizationId,
      },
    })) as unknown as CronRunDocument[];
  }

  async getRun(
    jobId: string,
    runId: string,
    organizationId: string,
  ): Promise<CronRunDocument | null> {
    return (await this.prisma.cronRun.findFirst({
      where: {
        cronJobId: jobId,
        id: runId,
        isDeleted: false,
        organizationId,
      },
    })) as unknown as CronRunDocument | null;
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
    const dueJobs = (await this.prisma.cronJob.findMany({
      orderBy: { nextRunAt: 'asc' },
      take: limit,
      where: {
        enabled: true,
        isDeleted: false,
        nextRunAt: { lte: new Date() },
      },
    })) as unknown as CronJobDocument[];

    let processed = 0;

    for (const job of dueJobs) {
      const lockKey = `cron-job:lock:${(job as Record<string, unknown>).id as string}`;
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
    const jobId = (job as Record<string, unknown>).id as string;

    const run = (await this.prisma.cronRun.create({
      data: {
        cronJobId: jobId,
        organizationId: (job as Record<string, unknown>)
          .organizationId as string,
        startedAt: start,
        status: 'running',
        trigger,
        userId: (job as Record<string, unknown>).userId as string,
      },
    })) as unknown as CronRunDocument;

    const runId = run.id;

    await this.prisma.cronJob.update({
      data: {
        lastRunAt: start,
        lastStatus: 'running',
      },
      where: { id: jobId },
    });

    try {
      const artifacts = await this.executeByType(job.jobType, job.payload, job);

      await this.prisma.cronRun.update({
        data: {
          artifacts: artifacts as Record<string, unknown>,
          endedAt: new Date(),
          status: 'success',
        },
        where: { id: runId },
      });

      await this.prisma.cronJob.update({
        data: {
          consecutiveFailures: 0,
          lastStatus: 'success',
          nextRunAt: computeNextRunAtOrThrow(job.schedule, job.timezone),
        },
        where: { id: jobId },
      });

      return (await this.prisma.cronRun.findUnique({
        where: { id: runId },
      })) as unknown as CronRunDocument;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';

      this.logger.error('Dynamic cron job execution failed', {
        error: message,
        jobId,
        jobType: job.jobType,
      });

      await this.prisma.cronRun.update({
        data: {
          endedAt: new Date(),
          error: message,
          status: 'failed',
        },
        where: { id: runId },
      });

      await this.prisma.cronJob.update({
        data: {
          consecutiveFailures: { increment: 1 },
          lastStatus: 'failed',
          nextRunAt: computeNextRunAtOrThrow(job.schedule, job.timezone),
        },
        where: { id: jobId },
      });

      return (await this.prisma.cronRun.findUnique({
        where: { id: runId },
      })) as unknown as CronRunDocument;
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
          id: workflowId,
          isDeleted: false,
          organizationId: (job as Record<string, unknown>)
            .organizationId as string,
          userId: (job as Record<string, unknown>).userId as string,
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
    const orgId = (job as Record<string, unknown>).organizationId as string;
    const userId = (job as Record<string, unknown>).userId as string;

    const strategy = strategyId
      ? await this.prisma.agentStrategy.findFirst({
          where: {
            id: strategyId,
            isDeleted: false,
            organizationId: orgId,
            userId,
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
      organization: orgId,
      strategy: strategy?.id,
      trigger: AgentExecutionTrigger.CRON,
      user: userId,
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
      organizationId: orgId,
      runId: run.id,
      strategyId: strategy ? String(strategy.id) : undefined,
      userId,
    });

    return {
      agentRunId: run.id,
      strategyId: strategy ? String(strategy.id) : null,
    };
  }

  private async generateNewsletterDraft(
    payload: NewsletterPayload,
    job: CronJobDocument,
  ): Promise<Record<string, unknown>> {
    const jobId = (job as Record<string, unknown>).id as string;
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
          jobId,
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
        jobId,
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
            jobId,
            markdown: `# ${topic}\n\nFallback draft generated by cron job ${jobId}.`,
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
          markdown: `# ${topic}\n\nFallback draft generated by cron job ${jobId}.`,
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
