import { AgentRunsService } from '@api/collections/agent-runs/services/agent-runs.service';
import type { AgentStrategyDocument } from '@api/collections/agent-strategies/schemas/agent-strategy.schema';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { CreateCronJobDto } from '@api/collections/cron-jobs/dto/create-cron-job.dto';
import { UpdateCronJobDto } from '@api/collections/cron-jobs/dto/update-cron-job.dto';
import {
  type CronJobDocument,
  type CronJobType,
} from '@api/collections/cron-jobs/schemas/cron-job.schema';
import type {
  CronRunDocument,
  CronRunTrigger,
} from '@api/collections/cron-jobs/schemas/cron-run.schema';
import {
  asNumber,
  asRecord,
  asString,
  buildCronJobConfig,
  isWorkflowMigratedJob,
  LEGACY_CRON_JOB_MIGRATION_STATUS,
  toCronJobDocument,
  toCronRunDocument,
} from '@api/collections/cron-jobs/services/cron-job-document.util';
import {
  type LegacyCronJobMigrationOptions,
  type LegacyCronJobMigrationReport,
  LegacyCronJobMigrationService,
} from '@api/collections/cron-jobs/services/legacy-cron-job-migration.service';
import { computeNextRunAtOrThrow } from '@api/collections/cron-jobs/utils/cron-schedule.util';
import { LegacyWorkflowStepRunner } from '@api/collections/workflows/services/legacy-workflow-step-runner.service';
import { WorkflowsService } from '@api/collections/workflows/services/workflows.service';
import { AgentRunQueueService } from '@api/queues/agent-run/agent-run-queue.service';
import { CacheService } from '@api/services/cache/services/cache.service';
import { OpenRouterService } from '@api/services/integrations/openrouter/services/openrouter.service';
import { SubstackService } from '@api/services/integrations/substack/services/substack.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  assertSafeWebhookHeaders,
  assertSafeWebhookUrl,
} from '@api/shared/utils/webhook-validator/webhook-validator.util';
import {
  AgentAutonomyMode,
  AgentExecutionTrigger,
  AgentType,
} from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, GoneException, Injectable } from '@nestjs/common';

/** Minimum credits required before executing a paid AI cron job type. */
const MIN_CREDITS_FOR_AI_JOB = 10;
export const LEGACY_CRON_JOBS_RETIRED_MESSAGE =
  'Legacy cron jobs are retired. Use workflow schedules for recurring automation.';

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

export type {
  LegacyCronJobMigrationDetail,
  LegacyCronJobMigrationDetailStatus,
  LegacyCronJobMigrationOptions,
  LegacyCronJobMigrationReport,
} from '@api/collections/cron-jobs/services/legacy-cron-job-migration.service';
export { computeNextRunAtOrThrow };

@Injectable()
export class CronJobsService {
  private static readonly CRON_JOB_BASE_CREDIT_COST: Record<string, number> = {
    agent_strategy_execution: 5,
    newsletter_substack: 3,
    workflow_execution: 5,
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly legacyCronJobMigrationService: LegacyCronJobMigrationService,
    private readonly workflowsService: WorkflowsService,
    private readonly legacyWorkflowStepRunner: LegacyWorkflowStepRunner,
    private readonly agentRunsService: AgentRunsService,
    private readonly agentRunQueueService: AgentRunQueueService,
    private readonly openRouterService: OpenRouterService,
    private readonly substackService: SubstackService,
    private readonly cacheService: CacheService,
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly logger: LoggerService,
  ) {}

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
    const config = asRecord(raw.config);
    const policies = asRecord(raw.policies);

    return {
      ...(strategy as unknown as AgentStrategyDocument),
      _id: asString(raw.mongoId) ?? asString(raw.id) ?? '',
      agentType: asString(config.agentType) ?? asString(raw.agentType),
      autonomyMode: asString(config.autonomyMode) ?? asString(raw.autonomyMode),
      brand: asString(raw.brandId) ?? asString(raw.brand) ?? null,
      dailyCreditBudget: asNumber(config.dailyCreditBudget, 0),
      model: asString(config.model) ?? null,
      organization:
        asString(raw.organizationId) ?? asString(raw.organization) ?? '',
      user: asString(raw.userId) ?? asString(raw.user) ?? '',
      config,
      policies,
    };
  }

  private throwRetiredMutation(): never {
    throw new GoneException(LEGACY_CRON_JOBS_RETIRED_MESSAGE);
  }

  async create(
    _userId: string,
    _organizationId: string,
    _dto: CreateCronJobDto,
  ): Promise<CronJobDocument> {
    this.throwRetiredMutation();
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
      .map((doc) => toCronJobDocument(doc))
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

    return job ? toCronJobDocument(job) : null;
  }

  async update(
    _id: string,
    _organizationId: string,
    _dto: UpdateCronJobDto,
  ): Promise<CronJobDocument | null> {
    this.throwRetiredMutation();
  }

  async pause(
    _id: string,
    _organizationId: string,
  ): Promise<CronJobDocument | null> {
    this.throwRetiredMutation();
  }

  async resume(
    _id: string,
    _organizationId: string,
  ): Promise<CronJobDocument | null> {
    this.throwRetiredMutation();
  }

  async delete(
    _id: string,
    _organizationId: string,
  ): Promise<CronJobDocument | null> {
    this.throwRetiredMutation();
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

    return runs.map((run) => toCronRunDocument(run));
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

    return run ? toCronRunDocument(run) : null;
  }

  async runNow(
    _id: string,
    _organizationId: string,
  ): Promise<CronRunDocument | null> {
    this.throwRetiredMutation();
  }

  async processDueJobs(limit = 30): Promise<number> {
    const dueJobs = (
      await this.prisma.cronJob.findMany({
        orderBy: { nextRunAt: 'asc' },
        take: limit,
        where: {
          isDeleted: false,
          nextRunAt: { lte: new Date() },
          NOT: {
            config: {
              equals: LEGACY_CRON_JOB_MIGRATION_STATUS,
              path: ['migration', 'status'],
            },
          },
          status: 'ACTIVE',
        },
      })
    )
      // Use unredacted documents for execution so webhook secrets are available.
      .map((job) => toCronJobDocument(job, { redactSecrets: false }));

    let processed = 0;

    for (const job of dueJobs) {
      if (isWorkflowMigratedJob(job)) {
        continue;
      }

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

  async migrateLegacyJobsToWorkflows(
    options: LegacyCronJobMigrationOptions = {},
  ): Promise<LegacyCronJobMigrationReport> {
    return this.legacyCronJobMigrationService.migrate(options);
  }

  async executeMigratedLegacyCronJob(params: {
    legacyCronJobId: string;
    organizationId: string;
    userId: string;
  }): Promise<Record<string, unknown>> {
    const row = await this.prisma.cronJob.findFirst({
      where: {
        id: params.legacyCronJobId,
        isDeleted: false,
        organizationId: params.organizationId,
        userId: params.userId,
      },
    });

    if (!row) {
      throw new Error('Migrated legacy cron job not found');
    }

    const job = toCronJobDocument(row, { redactSecrets: false });
    if (!isWorkflowMigratedJob(job)) {
      throw new Error('Legacy cron job has not been migrated to workflow');
    }

    return await this.executeByType(job.jobType, job.payload, job);
  }

  private async assertCreditBalance(
    organizationId: string,
    jobType: string,
  ): Promise<void> {
    const requiredCredits =
      CronJobsService.CRON_JOB_BASE_CREDIT_COST[jobType] ?? 5;

    const hasCredits =
      await this.creditsUtilsService.checkOrganizationCreditsAvailable(
        organizationId,
        requiredCredits,
      );

    if (!hasCredits) {
      this.logger.warn('Cron job skipped: insufficient credits', {
        jobType,
        organizationId,
        requiredCredits,
      });
      throw new Error(
        `Insufficient credits for cron job execution (${requiredCredits} required)`,
      );
    }
  }

  private async executeJob(
    job: CronJobDocument,
    trigger: CronRunTrigger,
  ): Promise<CronRunDocument> {
    const start = new Date();
    const jobId = job.id;

    await this.assertCreditBalance(
      (job as Record<string, unknown>).organizationId as string,
      job.jobType,
    );

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
        config: buildCronJobConfig(
          { lastStatus: 'running' },
          job.config,
        ) as never,
        lastRunAt: start,
      },
      where: { id: jobId },
    });

    try {
      await this.assertCreditBalance(
        (job as Record<string, unknown>).organizationId as string,
        job.jobType,
      );

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
          config: buildCronJobConfig(
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

      return toCronRunDocument(completedRun ?? run);
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
          config: buildCronJobConfig(
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

      return toCronRunDocument(failedRun ?? run);
    }
  }

  private async executeByType(
    jobType: CronJobType,
    payload: Record<string, unknown>,
    job: CronJobDocument,
  ): Promise<Record<string, unknown>> {
    // Credit guard: agent and newsletter jobs invoke paid AI models.
    // Refuse to execute if the organisation has insufficient credits.
    const isPaidAiJob =
      jobType === 'agent_strategy_execution' ||
      jobType === 'newsletter_substack';

    if (isPaidAiJob) {
      const orgId = (job as Record<string, unknown>).organizationId as string;
      const hasCredits =
        await this.creditsUtilsService.checkOrganizationCreditsAvailable(
          orgId,
          MIN_CREDITS_FOR_AI_JOB,
        );

      if (!hasCredits) {
        throw new BadRequestException(
          `Insufficient credits to execute cron job type "${jobType}"`,
        );
      }
    }

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

        await this.legacyWorkflowStepRunner.executeWorkflow(workflowId);
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
    // SSRF guard: validate webhook URL and headers before any processing begins.
    // assertSafeWebhookUrl / assertSafeWebhookHeaders throw BadRequestException
    // on any violation; that propagates as a job failure via executeJob's catch block.
    if (payload.webhookUrl) {
      await assertSafeWebhookUrl(payload.webhookUrl);
    }
    assertSafeWebhookHeaders(payload.webhookHeaders);

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
}
