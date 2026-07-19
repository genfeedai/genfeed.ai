import type { CronJobDocument } from '@api/collections/cron-jobs/schemas/cron-job.schema';
import {
  asRecord,
  asString,
  buildCronJobConfig,
  isWorkflowMigratedJob,
  LEGACY_CRON_JOB_MIGRATION_STATUS,
  readCronJobType,
  toCronJobDocument,
} from '@api/collections/cron-jobs/services/cron-job-document.util';
import { validateCronPayload } from '@api/collections/cron-jobs/utils/cron-payload-validation.util';
import { computeNextRunAtOrThrow } from '@api/collections/cron-jobs/utils/cron-schedule.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { WorkflowLifecycle, WorkflowStatus } from '@genfeedai/enums';
import { Injectable } from '@nestjs/common';

const LEGACY_CRON_JOB_MIGRATION_SOURCE = 'legacy-cron-job';
const LEGACY_CRON_JOB_NODE_TYPE = 'legacyCronJob';
const LEGACY_CRON_JOB_MIGRATION_VERSION = 1;

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
  jobType?: CronJobDocument['jobType'];
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

@Injectable()
export class LegacyCronJobMigrationService {
  constructor(private readonly prisma: PrismaService) {}

  async migrate(
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
      const rawConfig = asRecord(row.config);
      const jobType = readCronJobType(rawConfig.jobType);
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

      const job = toCronJobDocument(row, { redactSecrets: false });
      const existingWorkflow = await this.findMigratedWorkflow(
        this.prisma,
        cronJobId,
      );

      if (isWorkflowMigratedJob(job)) {
        report.skipped += 1;
        report.details.push({
          cronJobId,
          jobType,
          reason: 'already_migrated',
          status: 'already_migrated',
          workflowId:
            asString(asRecord(job.config?.migration).workflowId) ??
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
      const workflowId = asString(job.payload.workflowId);
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

  private legacyCronNodeLabel(jobType: CronJobDocument['jobType']): string {
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
    const nextConfig = buildCronJobConfig({ enabled: false }, job.config);
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
}
