import { AgentRunsService } from '@api/collections/agent-runs/services/agent-runs.service';
import type { AgentStrategyDocument } from '@api/collections/agent-strategies/schemas/agent-strategy.schema';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { CreateCronJobDto } from '@api/collections/cron-jobs/dto/create-cron-job.dto';
import { UpdateCronJobDto } from '@api/collections/cron-jobs/dto/update-cron-job.dto';
import {
  CRON_JOB_TYPES,
  type CronJobDocument,
  type CronJobLastStatus,
  type CronJobType,
} from '@api/collections/cron-jobs/schemas/cron-job.schema';
import type {
  CronRunDocument,
  CronRunTrigger,
} from '@api/collections/cron-jobs/schemas/cron-run.schema';
import { validateCronPayload } from '@api/collections/cron-jobs/utils/cron-payload-validation.util';
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
  WorkflowLifecycle,
  WorkflowStatus,
} from '@genfeedai/enums';
import type {
  CronJob as PrismaCronJob,
  CronRun as PrismaCronRun,
} from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, Injectable } from '@nestjs/common';
import { CronJob as CronParser } from 'cron';

/** Minimum credits required before executing a paid AI cron job type. */
const MIN_CREDITS_FOR_AI_JOB = 10;
const LEGACY_CRON_JOB_MIGRATION_STATUS = 'workflow_migrated';
const LEGACY_CRON_JOB_MIGRATION_SOURCE = 'legacy-cron-job';
const LEGACY_CRON_JOB_NODE_TYPE = 'legacyCronJob';
const LEGACY_CRON_JOB_MIGRATION_VERSION = 1;
const LEGACY_CRON_JOB_TYPES = new Set<string>(CRON_JOB_TYPES);

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

export type LegacyCronJobMigrationDetailStatus =
  | 'already_migrated'
  | 'failed'
  | 'invalid'
  | 'migrated'
  | 'skipped'
  | 'would_migrate';

export interface LegacyCronJobMigrationDetail {
  cronJobId: string;
  errors?: string[];
  jobType?: CronJobType;
  reason?: string;
  status: LegacyCronJobMigrationDetailStatus;
  workflowId?: string;
}

export interface LegacyCronJobMigrationReport {
  details: LegacyCronJobMigrationDetail[];
  dryRun: boolean;
  failed: number;
  invalid: number;
  migrated: number;
  scanned: number;
  skipped: number;
}

export interface LegacyCronJobMigrationOptions {
  dryRun?: boolean;
  limit?: number;
  organizationId?: string;
}

type CronJobMigrationClient = Pick<
  PrismaService,
  'cronJob' | 'cronRun' | 'workflow'
>;

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
  private static readonly CRON_JOB_BASE_CREDIT_COST: Record<string, number> = {
    agent_strategy_execution: 5,
    newsletter_substack: 3,
    workflow_execution: 5,
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly workflowsService: WorkflowsService,
    private readonly agentRunsService: AgentRunsService,
    private readonly agentRunQueueService: AgentRunQueueService,
    private readonly openRouterService: OpenRouterService,
    private readonly substackService: SubstackService,
    private readonly cacheService: CacheService,
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly logger: LoggerService,
  ) {}

  private toCronJobDocument(
    job: PrismaCronJob,
    options: { redactSecrets?: boolean } = { redactSecrets: true },
  ): CronJobDocument {
    const config = this.asRecord(job.config);
    const rawPayload = this.asRecord(config.payload);
    const payload = options.redactSecrets
      ? this.redactWebhookSecrets(rawPayload)
      : rawPayload;

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
      payload,
      schedule: this.asString(config.schedule) ?? job.expression ?? '* * * * *',
      timezone: this.asString(config.timezone) ?? 'UTC',
      user: job.userId,
    };
  }

  /**
   * Redact sensitive webhook fields from a payload before returning it to clients.
   * - webhookSecret is replaced with a masked placeholder when present.
   * - webhookHeaders has any Authorization / X-* auth-style header values masked.
   * The original values are preserved only in the internal DB record and are
   * read directly from the DB (not from the serialized document) during execution.
   */
  private redactWebhookSecrets(
    payload: Record<string, unknown>,
  ): Record<string, unknown> {
    const redacted = { ...payload };

    if (redacted.webhookSecret !== undefined) {
      redacted.webhookSecret = '[REDACTED]';
    }

    if (
      redacted.webhookHeaders !== null &&
      typeof redacted.webhookHeaders === 'object' &&
      !Array.isArray(redacted.webhookHeaders)
    ) {
      const headers = {
        ...(redacted.webhookHeaders as Record<string, string>),
      };
      for (const key of Object.keys(headers)) {
        const lower = key.toLowerCase();
        if (
          lower === 'authorization' ||
          lower.startsWith('x-') ||
          lower.includes('token') ||
          lower.includes('secret') ||
          lower.includes('api-key')
        ) {
          headers[key] = '[REDACTED]';
        }
      }
      redacted.webhookHeaders = headers;
    }

    return redacted;
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

  private readCronJobType(value: unknown): CronJobType | undefined {
    return typeof value === 'string' && LEGACY_CRON_JOB_TYPES.has(value)
      ? (value as CronJobType)
      : undefined;
  }

  private isWorkflowMigratedConfig(config: unknown): boolean {
    const migration = this.asRecord(this.asRecord(config).migration);
    return migration.status === LEGACY_CRON_JOB_MIGRATION_STATUS;
  }

  private isWorkflowMigratedJob(job: CronJobDocument): boolean {
    return this.isWorkflowMigratedConfig(job.config);
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
    // Read with raw (unredacted) payload so we don't accidentally persist '[REDACTED]'
    // back into the DB when the caller omits the payload field.
    const dbJob = await this.prisma.cronJob.findFirst({
      where: { id, isDeleted: false, organizationId },
    });
    if (!dbJob) {
      return null;
    }
    const current = this.toCronJobDocument(dbJob, { redactSecrets: false });

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

    // Return the redacted version to the API caller.
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
    const dbJob = await this.prisma.cronJob.findFirst({
      where: { id, isDeleted: false, organizationId },
    });
    if (!dbJob) {
      return null;
    }

    // Use unredacted document for execution so webhook secrets are available.
    const job = this.toCronJobDocument(dbJob, { redactSecrets: false });
    if (this.isWorkflowMigratedJob(job)) {
      this.logger.warn('Migrated cron job runNow ignored', {
        jobId: job.id,
        migrationStatus: LEGACY_CRON_JOB_MIGRATION_STATUS,
        organizationId,
      });
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
      .map((job) => this.toCronJobDocument(job, { redactSecrets: false }));

    let processed = 0;

    for (const job of dueJobs) {
      if (this.isWorkflowMigratedJob(job)) {
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
    const dryRun = options.dryRun !== false;
    const report: LegacyCronJobMigrationReport = {
      details: [],
      dryRun,
      failed: 0,
      invalid: 0,
      migrated: 0,
      scanned: 0,
      skipped: 0,
    };

    const rows = await this.prisma.cronJob.findMany({
      orderBy: { createdAt: 'asc' },
      ...(options.limit ? { take: options.limit } : {}),
      where: {
        isDeleted: false,
        ...(options.organizationId
          ? { organizationId: options.organizationId }
          : {}),
      },
    });

    for (const row of rows) {
      const rawConfig = this.asRecord(row.config);
      const jobType = this.readCronJobType(rawConfig.jobType);
      const cronJobId = row.id;
      report.scanned += 1;

      if (!jobType) {
        report.skipped += 1;
        report.details.push({
          cronJobId,
          reason: 'unsupported_job_type',
          status: 'skipped',
        });
        continue;
      }

      const job = this.toCronJobDocument(row, { redactSecrets: false });
      const existingWorkflow = await this.findMigratedWorkflow(
        this.prisma,
        cronJobId,
      );

      if (this.isWorkflowMigratedJob(job)) {
        report.skipped += 1;
        report.details.push({
          cronJobId,
          jobType,
          reason: 'already_migrated',
          status: 'already_migrated',
          workflowId:
            this.asString(this.asRecord(job.config?.migration).workflowId) ??
            existingWorkflow?.id,
        });
        continue;
      }

      const errors = await this.validateMigrationCandidate(job);
      if (errors.length > 0) {
        report.invalid += 1;
        report.details.push({
          cronJobId,
          errors,
          jobType,
          status: 'invalid',
        });
        continue;
      }

      if (dryRun) {
        report.migrated += 1;
        report.details.push({
          cronJobId,
          jobType,
          reason: existingWorkflow
            ? 'existing_migrated_workflow_found'
            : 'dry_run',
          status: 'would_migrate',
          workflowId: existingWorkflow?.id,
        });
        continue;
      }

      try {
        const workflowId = await this.migrateCronJobToWorkflow(job);
        report.migrated += 1;
        report.details.push({
          cronJobId,
          jobType,
          status: 'migrated',
          workflowId,
        });
      } catch (error: unknown) {
        report.failed += 1;
        report.details.push({
          cronJobId,
          errors: [error instanceof Error ? error.message : String(error)],
          jobType,
          status: 'failed',
        });
      }
    }

    return report;
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

    const job = this.toCronJobDocument(row, { redactSecrets: false });
    if (!this.isWorkflowMigratedJob(job)) {
      throw new Error('Legacy cron job has not been migrated to workflow');
    }

    return await this.executeByType(job.jobType, job.payload, job);
  }

  private async validateMigrationCandidate(
    job: CronJobDocument,
  ): Promise<string[]> {
    const errors = validateCronPayload(job.jobType, job.payload);

    try {
      computeNextRunAtOrThrow(job.schedule, job.timezone);
    } catch {
      errors.push('schedule or timezone is invalid');
    }

    if (!job.organizationId) {
      errors.push('organizationId is required');
    }
    if (!job.userId) {
      errors.push('userId is required');
    }

    if (job.jobType === 'workflow_execution') {
      const workflowId = this.asString(job.payload.workflowId);
      if (workflowId) {
        const workflow = await this.prisma.workflow.findFirst({
          select: { id: true },
          where: {
            id: workflowId,
            isDeleted: false,
            organizationId: job.organizationId,
            userId: job.userId,
          },
        });
        if (!workflow) {
          errors.push('payload.workflowId does not reference a live workflow');
        }
      }
    }

    return errors;
  }

  private async migrateCronJobToWorkflow(
    job: CronJobDocument,
  ): Promise<string> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const existing = await this.findMigratedWorkflow(tx, job.id);
            const workflowId =
              existing?.id ?? (await this.createMigratedWorkflow(tx, job)).id;

            await this.markCronJobMigrated(tx, job, workflowId);
            return workflowId;
          },
          { isolationLevel: 'Serializable' },
        );
      } catch (error: unknown) {
        if ((error as { code?: string }).code === 'P2034' && attempt === 0) {
          continue;
        }
        throw error;
      }
    }

    throw new Error('Failed to migrate legacy cron job after retry');
  }

  private async findMigratedWorkflow(
    client: CronJobMigrationClient,
    legacyCronJobId: string,
  ): Promise<{ id: string } | null> {
    return await client.workflow.findFirst({
      select: { id: true },
      where: {
        isDeleted: false,
        metadata: {
          equals: legacyCronJobId,
          path: ['legacyCronJobId'],
        },
      },
    });
  }

  private async createMigratedWorkflow(
    client: CronJobMigrationClient,
    job: CronJobDocument,
  ): Promise<{ id: string }> {
    const executionCount = await client.cronRun.count({
      where: {
        cronJobId: job.id,
        isDeleted: false,
        status: 'COMPLETED',
      },
    });

    return await client.workflow.create({
      data: {
        edges: [] as never,
        executionCount,
        inputVariables: [] as never,
        isDeleted: false,
        isScheduleEnabled: job.status === 'ACTIVE' && job.enabled,
        label: `Migrated: ${job.name}`,
        lastExecutedAt: job.lastRunAt,
        lifecycle: WorkflowLifecycle.PUBLISHED,
        metadata: {
          legacyCronJobId: job.id,
          legacyCronJobMongoId: job.mongoId,
          legacyCronJobType: job.jobType,
          migrationVersion: LEGACY_CRON_JOB_MIGRATION_VERSION,
          originalEnabled: job.enabled,
          originalNextRunAt: job.nextRunAt?.toISOString(),
          originalStatus: job.status,
          sourceIssue: 789,
          sourceType: LEGACY_CRON_JOB_MIGRATION_SOURCE,
        } as never,
        nodes: [
          {
            data: {
              config: {
                jobType: job.jobType,
                legacyCronJobId: job.id,
              },
              label: this.legacyCronNodeLabel(job.jobType),
            },
            id: LEGACY_CRON_JOB_NODE_TYPE,
            position: { x: 0, y: 120 },
            type: LEGACY_CRON_JOB_NODE_TYPE,
          },
        ] as never,
        organizationId: job.organizationId,
        progress: 0,
        schedule: job.schedule,
        status: WorkflowStatus.ACTIVE,
        steps: [] as never,
        timezone: job.timezone,
        userId: job.userId,
      },
      select: { id: true },
    });
  }

  private legacyCronNodeLabel(jobType: CronJobType): string {
    switch (jobType) {
      case 'workflow_execution':
        return 'Execute Legacy Workflow Schedule';
      case 'agent_strategy_execution':
        return 'Execute Legacy Agent Strategy';
      case 'newsletter_substack':
        return 'Generate Legacy Substack Newsletter';
    }
  }

  private async markCronJobMigrated(
    client: CronJobMigrationClient,
    job: CronJobDocument,
    workflowId: string,
  ): Promise<void> {
    const nextConfig = this.buildCronJobConfig({ enabled: false }, job.config);
    nextConfig.migration = {
      migratedAt: new Date().toISOString(),
      originalEnabled: job.enabled,
      originalNextRunAt: job.nextRunAt?.toISOString(),
      originalStatus: job.status,
      status: LEGACY_CRON_JOB_MIGRATION_STATUS,
      workflowId,
    };

    await client.cronJob.update({
      data: {
        config: nextConfig as never,
        status: 'PAUSED',
      },
      where: { id: job.id },
    });
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
        config: this.buildCronJobConfig(
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
