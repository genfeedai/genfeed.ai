import { AgentRunsService } from '@api/collections/agent-runs/services/agent-runs.service';
import type { AgentStrategyDocument } from '@api/collections/agent-strategies/schemas/agent-strategy.schema';
import { CreateCronJobDto } from '@api/collections/cron-jobs/dto/create-cron-job.dto';
import { UpdateCronJobDto } from '@api/collections/cron-jobs/dto/update-cron-job.dto';
import type {
  CronJobDocument,
  CronJobLastStatus,
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
import type {
  CronJob as PrismaCronJob,
  CronRun as PrismaCronRun,
} from '@genfeedai/prisma';
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

  private toCronJobDocument(job: PrismaCronJob): CronJobDocument {
    const config = this.asRecord(job.config);

    return {
      ...job,
      _id: job.mongoId ?? job.id,
      config,
      consecutiveFailures: this.asNumber(config.consecutiveFailures, 0),
      enabled: this.asBoolean(config.enabled, job.status === 'ACTIVE'),
      jobType: this.asCronJobType(config.jobType),
      lastStatus: this.asCronJobLastStatus(config.lastStatus),
      name: this.asString(config.name) ?? job.label ?? 'Untitled cron job',
      organization: job.organizationId,
      payload: this.asRecord(config.payload),
      schedule: this.asString(config.schedule) ?? job.expression ?? '* * * * *',
      timezone: this.asString(config.timezone) ?? 'UTC',
      user: job.userId,
    };
  }

  private toCronRunDocument(run: PrismaCronRun): CronRunDocument {
    const result = this.asRecord(run.result);

    return {
      ...run,
      _id: run.mongoId ?? run.id,
      artifacts: this.asRecord(result.artifacts),
      organization: run.organizationId,
      result,
      trigger: this.asCronRunTrigger(result.trigger),
      user: run.userId,
    };
  }

  private buildCronJobConfig(
    data: Partial<{
      consecutiveFailures: number;
      enabled: boolean;
      jobType: CronJobType;
      lastStatus: CronJobLastStatus;
      name: string;
      payload: Record<string, unknown>;
      schedule: string;
      timezone: string;
    }>,
    existingConfig?: unknown,
  ): Record<string, unknown> {
    const payload = this.asRecord(existingConfig);

    if (data.consecutiveFailures !== undefined) {
      payload.consecutiveFailures = data.consecutiveFailures;
    }
    if (data.enabled !== undefined) {
      payload.enabled = data.enabled;
    }
    if (data.jobType !== undefined) {
      payload.jobType = data.jobType;
    }
    if (data.lastStatus !== undefined) {
      payload.lastStatus = data.lastStatus;
    }
    if (data.name !== undefined) {
      payload.name = data.name;
    }
    if (data.payload !== undefined) {
      payload.payload = data.payload;
    }
    if (data.schedule !== undefined) {
      payload.schedule = data.schedule;
    }
    if (data.timezone !== undefined) {
      payload.timezone = data.timezone;
    }

    return payload;
  }

  private normalizeAgentStrategy(
    strategy: PrismaService['agentStrategy'] extends {
      findFirst(args: unknown): Promise<infer T>;
    }
      ? Awaited<T>
      : never,
  ): AgentStrategyDocument | null {
    if (!strategy) {
      return null;
    }

    const raw = strategy as unknown as Record<string, unknown>;
    const config = this.asRecord(raw.config);
    const policies = this.asRecord(raw.policies);

    return {
      ...(strategy as unknown as AgentStrategyDocument),
      _id: this.asString(raw.mongoId) ?? this.asString(raw.id) ?? '',
      agentType:
        this.asString(config.agentType) ?? this.asString(raw.agentType),
      autonomyMode:
        this.asString(config.autonomyMode) ?? this.asString(raw.autonomyMode),
      brand: this.asString(raw.brandId) ?? this.asString(raw.brand) ?? null,
      dailyCreditBudget: this.asNumber(config.dailyCreditBudget, 0),
      model: this.asString(config.model) ?? null,
      organization:
        this.asString(raw.organizationId) ??
        this.asString(raw.organization) ??
        '',
      user: this.asString(raw.userId) ?? this.asString(raw.user) ?? '',
      config,
      policies,
    };
  }

  private asRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }

    return { ...(value as Record<string, unknown>) };
  }

  private asString(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }

  private asBoolean(value: unknown, fallback: boolean): boolean {
    if (typeof value === 'boolean') {
      return value;
    }

    return fallback;
  }

  private asNumber(value: unknown, fallback: number): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }

    return fallback;
  }

  private asCronJobType(value: unknown): CronJobType {
    return value === 'agent_strategy_execution' ||
      value === 'newsletter_substack' ||
      value === 'workflow_execution'
      ? value
      : 'workflow_execution';
  }

  private asCronJobLastStatus(value: unknown): CronJobLastStatus {
    return value === 'failed' || value === 'running' || value === 'success'
      ? value
      : 'never';
  }

  private asCronRunTrigger(value: unknown): CronRunTrigger | undefined {
    return value === 'manual' || value === 'scheduled' ? value : undefined;
  }

  async create(
    userId: string,
    organizationId: string,
    dto: CreateCronJobDto,
  ): Promise<CronJobDocument> {
    this.assertValidSchedule(dto.schedule, dto.timezone);

    const created = await this.prisma.cronJob.create({
      data: {
        config: this.buildCronJobConfig({
          consecutiveFailures: 0,
          enabled: dto.enabled ?? true,
          jobType: dto.jobType,
          lastStatus: 'never',
          name: dto.name,
          payload: dto.payload ?? {},
          schedule: dto.schedule,
          timezone: dto.timezone ?? 'UTC',
        }) as never,
        expression: dto.schedule,
        label: dto.name,
        nextRunAt: computeNextRunAtOrThrow(dto.schedule, dto.timezone),
        organizationId,
        status: dto.enabled === false ? 'PAUSED' : 'ACTIVE',
        userId,
      },
    });

    return this.toCronJobDocument(created);
  }

  async list(
    organizationId: string,
    filters: {
      enabled?: boolean;
      jobType?: string;
    } = {},
  ): Promise<CronJobDocument[]> {
    const docs = await this.prisma.cronJob.findMany({
      orderBy: { createdAt: 'desc' },
      where: {
        isDeleted: false,
        organizationId,
        ...(filters.enabled !== undefined
          ? { status: filters.enabled ? 'ACTIVE' : 'PAUSED' }
          : {}),
      },
    });

    return docs
      .map((doc) => this.toCronJobDocument(doc))
      .filter((doc) =>
        filters.jobType ? doc.jobType === filters.jobType : true,
      );
  }

  async findOne(
    id: string,
    organizationId: string,
  ): Promise<CronJobDocument | null> {
    const job = await this.prisma.cronJob.findFirst({
      where: {
        id,
        isDeleted: false,
        organizationId,
      },
    });

    return job ? this.toCronJobDocument(job) : null;
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

    const updated = await this.prisma.cronJob.update({
      data: {
        config: this.buildCronJobConfig(
          {
            consecutiveFailures: current.consecutiveFailures,
            enabled: dto.enabled ?? current.enabled,
            jobType: current.jobType,
            lastStatus: current.lastStatus,
            name: dto.name ?? current.name,
            payload: dto.payload ?? current.payload,
            schedule,
            timezone,
          },
          current.config,
        ) as never,
        ...(dto.name !== undefined ? { label: dto.name } : {}),
        ...(dto.schedule !== undefined ? { expression: dto.schedule } : {}),
        nextRunAt: computeNextRunAtOrThrow(schedule, timezone),
        ...(dto.enabled !== undefined
          ? { status: dto.enabled ? 'ACTIVE' : 'PAUSED' }
          : {}),
      },
      where: { id },
    });

    return this.toCronJobDocument(updated);
  }

  async pause(
    id: string,
    organizationId: string,
  ): Promise<CronJobDocument | null> {
    const existing = await this.findOne(id, organizationId);
    if (!existing) return null;

    const updated = await this.prisma.cronJob.update({
      data: {
        config: this.buildCronJobConfig(
          { enabled: false },
          existing.config,
        ) as never,
        status: 'PAUSED',
      },
      where: { id },
    });

    return this.toCronJobDocument(updated);
  }

  async resume(
    id: string,
    organizationId: string,
  ): Promise<CronJobDocument | null> {
    const current = await this.findOne(id, organizationId);
    if (!current) {
      return null;
    }

    const updated = await this.prisma.cronJob.update({
      data: {
        config: this.buildCronJobConfig(
          { enabled: true },
          current.config,
        ) as never,
        nextRunAt: computeNextRunAtOrThrow(current.schedule, current.timezone),
        status: 'ACTIVE',
      },
      where: { id },
    });

    return this.toCronJobDocument(updated);
  }

  async delete(
    id: string,
    organizationId: string,
  ): Promise<CronJobDocument | null> {
    const existing = await this.findOne(id, organizationId);
    if (!existing) return null;

    const updated = await this.prisma.cronJob.update({
      data: {
        config: this.buildCronJobConfig(
          { enabled: false },
          existing.config,
        ) as never,
        isDeleted: true,
        status: 'PAUSED',
      },
      where: { id },
    });

    return this.toCronJobDocument(updated);
  }

  async getRuns(
    id: string,
    organizationId: string,
  ): Promise<CronRunDocument[]> {
    const runs = await this.prisma.cronRun.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      where: {
        cronJobId: id,
        isDeleted: false,
        organizationId,
      },
    });

    return runs.map((run) => this.toCronRunDocument(run));
  }

  async getRun(
    jobId: string,
    runId: string,
    organizationId: string,
  ): Promise<CronRunDocument | null> {
    const run = await this.prisma.cronRun.findFirst({
      where: {
        cronJobId: jobId,
        id: runId,
        isDeleted: false,
        organizationId,
      },
    });

    return run ? this.toCronRunDocument(run) : null;
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
    const dueJobs = (
      await this.prisma.cronJob.findMany({
        orderBy: { nextRunAt: 'asc' },
        take: limit,
        where: {
          isDeleted: false,
          nextRunAt: { lte: new Date() },
          status: 'ACTIVE',
        },
      })
    ).map((job) => this.toCronJobDocument(job));

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
    const jobId = job.id;

    const run = await this.prisma.cronRun.create({
      data: {
        cronJobId: jobId,
        organizationId: job.organizationId,
        result: { trigger } as never,
        startedAt: start,
        status: 'RUNNING',
        userId: job.userId,
      },
    });

    const runId = run.id;

    await this.prisma.cronJob.update({
      data: {
        config: this.buildCronJobConfig(
          { lastStatus: 'running' },
          job.config,
        ) as never,
        lastRunAt: start,
      },
      where: { id: jobId },
    });

    try {
      const artifacts = await this.executeByType(job.jobType, job.payload, job);

      await this.prisma.cronRun.update({
        data: {
          completedAt: new Date(),
          result: { artifacts, trigger } as never,
          status: 'COMPLETED',
        },
        where: { id: runId },
      });

      await this.prisma.cronJob.update({
        data: {
          config: this.buildCronJobConfig(
            {
              consecutiveFailures: 0,
              lastStatus: 'success',
            },
            job.config,
          ) as never,
          nextRunAt: computeNextRunAtOrThrow(job.schedule, job.timezone),
        },
        where: { id: jobId },
      });

      const completedRun = await this.prisma.cronRun.findUnique({
        where: { id: runId },
      });

      return this.toCronRunDocument(completedRun ?? run);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';

      this.logger.error('Dynamic cron job execution failed', {
        error: message,
        jobId,
        jobType: job.jobType,
      });

      await this.prisma.cronRun.update({
        data: {
          completedAt: new Date(),
          error: message,
          result: { trigger } as never,
          status: 'FAILED',
        },
        where: { id: runId },
      });

      await this.prisma.cronJob.update({
        data: {
          config: this.buildCronJobConfig(
            {
              consecutiveFailures: job.consecutiveFailures + 1,
              lastStatus: 'failed',
            },
            job.config,
          ) as never,
          nextRunAt: computeNextRunAtOrThrow(job.schedule, job.timezone),
        },
        where: { id: jobId },
      });

      const failedRun = await this.prisma.cronRun.findUnique({
        where: { id: runId },
      });

      return this.toCronRunDocument(failedRun ?? run);
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
    const normalizedStrategy = this.normalizeAgentStrategy(strategy);

    const objective =
      typedPayload.objective ??
      (normalizedStrategy
        ? `Execute strategy objective for ${normalizedStrategy.label}`
        : 'Run autonomous agent objective');

    const run = await this.agentRunsService.create({
      creditBudget:
        typedPayload.creditBudget ?? normalizedStrategy?.dailyCreditBudget,
      label: normalizedStrategy
        ? `Cron: ${normalizedStrategy.label}`
        : `Cron Agent Job: ${job.name}`,
      objective,
      organization: orgId,
      strategy: normalizedStrategy?.id,
      trigger: AgentExecutionTrigger.CRON,
      user: userId,
    });

    await this.agentRunQueueService.queueRun({
      agentType:
        typedPayload.agentType ??
        normalizedStrategy?.agentType ??
        AgentType.GENERAL,
      autonomyMode:
        typedPayload.autonomyMode ??
        normalizedStrategy?.autonomyMode ??
        AgentAutonomyMode.SUPERVISED,
      creditBudget:
        typedPayload.creditBudget ??
        normalizedStrategy?.dailyCreditBudget ??
        50,
      model: typedPayload.model ?? normalizedStrategy?.model ?? undefined,
      objective,
      organizationId: orgId,
      runId: run.id,
      strategyId: normalizedStrategy
        ? String(normalizedStrategy.id)
        : undefined,
      userId,
    });

    return {
      agentRunId: run.id,
      strategyId: normalizedStrategy ? String(normalizedStrategy.id) : null,
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
