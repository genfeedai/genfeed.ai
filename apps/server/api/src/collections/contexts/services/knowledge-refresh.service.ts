import { createHash, randomUUID } from 'node:crypto';
import type { KnowledgeActor } from '@api/collections/contexts/interfaces/knowledge-actor.interface';
import { hashKnowledgeContent } from '@api/collections/contexts/services/knowledge-capture.service';
import { KnowledgeRecordsService } from '@api/collections/contexts/services/knowledge-records.service';
import { KnowledgeSourceIngestWorkflowService } from '@api/collections/contexts/services/knowledge-source-ingest-workflow.service';
import { extractSourceText } from '@api/collections/contexts/utils/extract-source-text.util';
import { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import { WorkflowsService } from '@api/collections/workflows/services/workflows.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  KNOWLEDGE_REFRESH_GRACE_MAX,
  KNOWLEDGE_REFRESH_GRACE_MIN,
  KNOWLEDGE_REFRESH_INTERVAL_MAX,
  KNOWLEDGE_REFRESH_INTERVAL_MIN,
  KNOWLEDGE_REFRESH_SCHEDULE_CRON,
  KNOWLEDGE_RSS_REFRESH_GRACE_MINUTES,
  KNOWLEDGE_RSS_REFRESH_INTERVAL_MINUTES,
  KNOWLEDGE_URL_REFRESH_GRACE_MINUTES,
  KNOWLEDGE_URL_REFRESH_INTERVAL_MINUTES,
  KnowledgeBaseCategory,
  KnowledgeProcessingState,
  KnowledgeRefreshRunOutcome,
  KnowledgeRefreshRunStatus,
  KnowledgeRetrievalState,
  KnowledgeSourceKind,
  KnowledgeSourceSyncState,
  WorkflowStatus,
} from '@genfeedai/contracts';
import type { KnowledgeSourceRefreshPolicyRequest } from '@genfeedai/contracts/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, Injectable, Optional } from '@nestjs/common';

const LEASE_MS = 5 * 60 * 1000;
const BACKOFF_MINUTES = [15, 30, 60, 120];
const SAFE_ERRORS = {
  missing: 'Source origin is gone',
  denied: 'Access to the source was denied',
  rateLimited: 'The source rate-limited this check',
  timeout: 'The source timed out',
  invalidFeed: 'The feed is not valid',
  tooLarge: 'The source exceeds the ingest size limit',
  ingestion: 'Ingestion failed',
  network: 'The source could not be reached',
} as const;

export interface KnowledgeRefreshResult {
  jobId?: string;
  refreshRunId: string;
  sourceId: string;
}

@Injectable()
export class KnowledgeRefreshService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly records: KnowledgeRecordsService,
    private readonly ingestWorkflow: KnowledgeSourceIngestWorkflowService,
    private readonly logger: LoggerService,
    @Optional() private readonly workflows?: WorkflowsService,
    @Optional() private readonly workflowQueue?: WorkflowExecutionQueueService,
  ) {}

  defaultPolicy(kind: KnowledgeSourceKind): {
    intervalMinutes: number;
    graceMinutes: number;
  } {
    if (kind === KnowledgeSourceKind.RSS) {
      return {
        graceMinutes: KNOWLEDGE_RSS_REFRESH_GRACE_MINUTES,
        intervalMinutes: KNOWLEDGE_RSS_REFRESH_INTERVAL_MINUTES,
      };
    }
    return {
      graceMinutes: KNOWLEDGE_URL_REFRESH_GRACE_MINUTES,
      intervalMinutes: KNOWLEDGE_URL_REFRESH_INTERVAL_MINUTES,
    };
  }

  async setPolicy(
    actor: KnowledgeActor,
    sourceId: string,
    policy: KnowledgeSourceRefreshPolicyRequest,
  ) {
    const source = await this.records.getSource(actor, sourceId);
    const kind =
      source.kind === KnowledgeSourceKind.RSS
        ? KnowledgeSourceKind.RSS
        : source.kind === KnowledgeSourceKind.URL
          ? KnowledgeSourceKind.URL
          : null;
    if (!kind) {
      throw new BadRequestException('Refresh policy is only for URL and RSS');
    }
    const defaults = this.defaultPolicy(kind);
    const intervalMinutes =
      policy.intervalMinutes ??
      source.refreshIntervalMinutes ??
      defaults.intervalMinutes;
    const graceMinutes =
      policy.graceMinutes ?? source.gracePeriodMinutes ?? defaults.graceMinutes;
    if (
      intervalMinutes < KNOWLEDGE_REFRESH_INTERVAL_MIN ||
      intervalMinutes > KNOWLEDGE_REFRESH_INTERVAL_MAX
    ) {
      throw new BadRequestException('Refresh interval is out of bounds');
    }
    if (
      graceMinutes < KNOWLEDGE_REFRESH_GRACE_MIN ||
      graceMinutes > KNOWLEDGE_REFRESH_GRACE_MAX
    ) {
      throw new BadRequestException('Refresh grace period is out of bounds');
    }
    const referenceUrl =
      source.referenceUrl ??
      (await this.readOrigin(sourceId, actor.organizationId));
    if (policy.isEnabled && !referenceUrl) {
      throw new BadRequestException('Source has no captured reference URL');
    }
    if (policy.isEnabled && !actor.brandId) {
      throw new BadRequestException(
        'Scheduled refresh requires a brand-scoped Knowledge source',
      );
    }
    const refreshWorkflowId = await this.syncRefreshWorkflow(
      actor,
      sourceId,
      source.title,
      source.refreshWorkflowId,
      policy.isEnabled,
    );
    return this.prisma.knowledgeSource.update({
      where: { id: sourceId },
      data: {
        gracePeriodMinutes: graceMinutes,
        isRefreshEnabled: policy.isEnabled,
        nextCheckAt: policy.isEnabled
          ? new Date(Date.now() + intervalMinutes * 60_000)
          : null,
        referenceUrl,
        refreshIntervalMinutes: intervalMinutes,
        refreshWorkflowId,
      },
    });
  }

  async unscheduleSource(
    actor: KnowledgeActor,
    sourceId: string,
  ): Promise<void> {
    const source = await this.records.getSource(actor, sourceId);
    if (!source.refreshWorkflowId) {
      return;
    }
    await this.syncRefreshWorkflow(
      actor,
      sourceId,
      source.title,
      source.refreshWorkflowId,
      false,
    );
    await this.prisma.knowledgeSource.update({
      where: { id: sourceId },
      data: { isRefreshEnabled: false },
    });
  }

  async refresh(
    actor: KnowledgeActor,
    sourceId: string,
    tickKey: string,
    options: { force?: boolean } = {},
  ): Promise<KnowledgeRefreshResult> {
    const source = await this.records.getSource(actor, sourceId);
    if (
      source.kind !== KnowledgeSourceKind.URL &&
      source.kind !== KnowledgeSourceKind.RSS
    ) {
      throw new BadRequestException('Refresh is only for URL and RSS');
    }
    if (
      !options.force &&
      source.nextCheckAt &&
      source.nextCheckAt.getTime() > Date.now()
    ) {
      return this.skipRun(actor, sourceId, tickKey);
    }
    const claimed = await this.claimRun(actor, source, tickKey);
    if (claimed.existingJobId) {
      return {
        jobId: claimed.existingJobId,
        refreshRunId: claimed.runId,
        sourceId,
      };
    }
    try {
      return await this.executeClaimedRun(actor, sourceId, claimed.runId);
    } catch (error: unknown) {
      await this.failRun(claimed.runId, actor.organizationId, sourceId, error);
      throw error;
    }
  }

  private async executeClaimedRun(
    actor: KnowledgeActor,
    sourceId: string,
    runId: string,
  ): Promise<KnowledgeRefreshResult> {
    const source = await this.records.getSource(actor, sourceId);
    const current = await this.records.getCurrentVersion(actor, sourceId);
    const origin =
      source.referenceUrl ??
      this.readPayloadUrl(current.payload) ??
      this.readPayloadUrl(current.provenance);
    if (!origin) {
      throw new BadRequestException('Source has no captured reference URL');
    }
    const category =
      source.kind === KnowledgeSourceKind.RSS
        ? KnowledgeBaseCategory.RSS
        : KnowledgeBaseCategory.URL;
    const extracted = await extractSourceText({
      category,
      conditional: {
        etag: source.etag ?? undefined,
        lastModified: source.lastModified ?? undefined,
      },
      referenceUrl: origin,
    });
    if (extracted.notModified) {
      await this.completeUnchanged(runId, actor.organizationId, sourceId);
      return { refreshRunId: runId, sourceId };
    }
    const fingerprint = createHash('sha256')
      .update(extracted.text)
      .digest('hex');
    const priorFingerprint = this.readFingerprint(current.payload);
    if (priorFingerprint && priorFingerprint === fingerprint) {
      await this.completeUnchanged(runId, actor.organizationId, sourceId, {
        etag: extracted.etag,
        lastModified: extracted.lastModified,
      });
      return { refreshRunId: runId, sourceId };
    }
    const candidate = await this.records.createCandidateVersion(
      actor,
      sourceId,
      {
        contentHash: hashKnowledgeContent(extracted.text),
        observedAt: new Date().toISOString(),
        payload: {
          contentFingerprint: fingerprint,
          extractedText: extracted.text,
          mimeType: extracted.mimeType,
          referenceUrl: origin,
          text: extracted.text,
        },
        provenance: {
          capturedAt: new Date().toISOString(),
          capturedBy: 'refresh',
          refreshRunId: runId,
          url: origin,
        },
      },
    );
    await this.prisma.knowledgeSourceRefreshRun.update({
      where: { id: runId },
      data: {
        candidateVersionId: candidate.id,
        expectedCurrentVersionId: current.id,
        status: KnowledgeRefreshRunStatus.PROCESSING,
      },
    });
    const jobId = await this.ingestWorkflow.enqueueIngest({
      organizationId: actor.organizationId,
      sourceId,
      versionId: candidate.id,
    });
    return { jobId, refreshRunId: runId, sourceId };
  }

  async promoteCandidate(input: {
    organizationId: string;
    sourceId: string;
    versionId: string;
  }): Promise<void> {
    const run = await this.prisma.knowledgeSourceRefreshRun.findFirst({
      where: {
        candidateVersionId: input.versionId,
        isDeleted: false,
        organizationId: input.organizationId,
        sourceId: input.sourceId,
      },
    });
    if (!run) {
      return;
    }
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.knowledgeSourceVersion.updateMany({
        where: {
          id: { not: input.versionId },
          isCurrent: true,
          isDeleted: false,
          organizationId: input.organizationId,
          sourceId: input.sourceId,
        },
        data: {
          isCurrent: false,
          retrievalState: KnowledgeRetrievalState.SUPERSEDED,
          supersededByVersionId: input.versionId,
        },
      });
      await tx.knowledgeSourceVersion.updateMany({
        where: {
          id: input.versionId,
          organizationId: input.organizationId,
          sourceId: input.sourceId,
        },
        data: {
          isCurrent: true,
          processingState: KnowledgeProcessingState.READY,
          retrievalState: KnowledgeRetrievalState.ACTIVE,
        },
      });
      await tx.knowledgeSourceRefreshRun.update({
        where: { id: run.id },
        data: {
          completedAt: now,
          outcome: KnowledgeRefreshRunOutcome.CHANGED,
          status: KnowledgeRefreshRunStatus.COMPLETED,
        },
      });
      const source = await tx.knowledgeSource.findFirst({
        where: {
          id: input.sourceId,
          organizationId: input.organizationId,
          isDeleted: false,
        },
      });
      await tx.knowledgeSource.update({
        where: { id: input.sourceId },
        data: {
          consecutiveFailures: 0,
          firstFailureAt: null,
          lastCheckedAt: now,
          lastSuccessfulSyncAt: now,
          lastSyncError: null,
          nextCheckAt: this.nextCheckAtFrom(source, now, false),
          staleAt: null,
          syncState: KnowledgeSourceSyncState.CURRENT,
        },
      });
    });
  }

  private async claimRun(
    actor: KnowledgeActor,
    source: { id: string; organizationId: string },
    tickKey: string,
  ): Promise<{ existingJobId?: string; runId: string }> {
    const existing = await this.prisma.knowledgeSourceRefreshRun.findFirst({
      where: {
        isDeleted: false,
        organizationId: actor.organizationId,
        sourceId: source.id,
        tickKey,
      },
    });
    if (existing) {
      return { runId: existing.id };
    }
    const unfinished = await this.prisma.knowledgeSourceRefreshRun.findFirst({
      where: {
        isDeleted: false,
        organizationId: actor.organizationId,
        sourceId: source.id,
        status: {
          in: [
            KnowledgeRefreshRunStatus.QUEUED,
            KnowledgeRefreshRunStatus.PROCESSING,
          ],
        },
      },
    });
    if (unfinished) {
      return { runId: unfinished.id };
    }
    const created = await this.prisma.knowledgeSourceRefreshRun.create({
      data: {
        attemptCount: 1,
        leaseExpiresAt: new Date(Date.now() + LEASE_MS),
        leaseToken: randomUUID(),
        organizationId: actor.organizationId,
        sourceId: source.id,
        startedAt: new Date(),
        status: KnowledgeRefreshRunStatus.PROCESSING,
        tickKey,
      },
    });
    await this.prisma.knowledgeSource.update({
      where: { id: source.id },
      data: { syncState: KnowledgeSourceSyncState.CHECKING },
    });
    return { runId: created.id };
  }

  private async completeUnchanged(
    runId: string,
    organizationId: string,
    sourceId: string,
    validators?: { etag?: string; lastModified?: string },
  ): Promise<void> {
    const now = new Date();
    const source = await this.prisma.knowledgeSource.findFirst({
      where: { id: sourceId, organizationId, isDeleted: false },
    });
    await this.prisma.$transaction([
      this.prisma.knowledgeSourceRefreshRun.update({
        where: { id: runId },
        data: {
          completedAt: now,
          outcome: KnowledgeRefreshRunOutcome.UNCHANGED,
          status: KnowledgeRefreshRunStatus.COMPLETED,
        },
      }),
      this.prisma.knowledgeSource.update({
        where: { id: sourceId },
        data: {
          consecutiveFailures: 0,
          etag: validators?.etag,
          firstFailureAt: null,
          lastCheckedAt: now,
          lastModified: validators?.lastModified,
          lastSuccessfulSyncAt: now,
          lastSyncError: null,
          nextCheckAt: this.nextCheckAtFrom(source, now, false),
          staleAt: null,
          syncState: KnowledgeSourceSyncState.CURRENT,
        },
      }),
    ]);
    this.logger.log('Knowledge refresh unchanged', {
      organizationId,
      runId,
      sourceId,
    });
  }

  private async failRun(
    runId: string,
    organizationId: string,
    sourceId: string,
    error: unknown,
  ): Promise<void> {
    const message = this.toSafeError(error);
    const source = await this.prisma.knowledgeSource.findFirst({
      where: { id: sourceId, organizationId, isDeleted: false },
    });
    const consecutiveFailures = (source?.consecutiveFailures ?? 0) + 1;
    const firstFailureAt = source?.firstFailureAt ?? new Date();
    const graceMinutes = source?.gracePeriodMinutes ?? 10_080;
    const isStale =
      consecutiveFailures >= 2 &&
      Date.now() - firstFailureAt.getTime() >= graceMinutes * 60_000;
    const backoff =
      BACKOFF_MINUTES[
        Math.min(consecutiveFailures - 1, BACKOFF_MINUTES.length - 1)
      ] ?? 120;
    await this.prisma.$transaction([
      this.prisma.knowledgeSourceRefreshRun.update({
        where: { id: runId },
        data: {
          completedAt: new Date(),
          error: message,
          nextAttemptAt: new Date(Date.now() + backoff * 60_000),
          status: KnowledgeRefreshRunStatus.FAILED,
        },
      }),
      this.prisma.knowledgeSource.update({
        where: { id: sourceId },
        data: {
          consecutiveFailures,
          firstFailureAt,
          lastCheckedAt: new Date(),
          lastSyncError: message,
          nextCheckAt: this.nextCheckAtFrom(source, new Date(), true, backoff),
          staleAt: isStale ? new Date() : source?.staleAt,
          syncState: isStale
            ? KnowledgeSourceSyncState.STALE
            : KnowledgeSourceSyncState.FAILED,
        },
      }),
    ]);
  }

  private async skipRun(
    actor: KnowledgeActor,
    sourceId: string,
    tickKey: string,
  ): Promise<KnowledgeRefreshResult> {
    const existing = await this.prisma.knowledgeSourceRefreshRun.findFirst({
      where: {
        isDeleted: false,
        organizationId: actor.organizationId,
        sourceId,
        tickKey,
      },
    });
    if (existing) {
      return { refreshRunId: existing.id, sourceId };
    }
    const created = await this.prisma.knowledgeSourceRefreshRun.create({
      data: {
        completedAt: new Date(),
        organizationId: actor.organizationId,
        outcome: KnowledgeRefreshRunOutcome.SKIPPED,
        sourceId,
        status: KnowledgeRefreshRunStatus.COMPLETED,
        tickKey,
      },
    });
    return { refreshRunId: created.id, sourceId };
  }

  private nextCheckAtFrom(
    source: {
      kind?: string | null;
      refreshIntervalMinutes?: number | null;
    } | null,
    now: Date,
    isFailure: boolean,
    backoffMinutes?: number,
  ): Date {
    const defaults = this.defaultPolicy(
      source?.kind === KnowledgeSourceKind.RSS
        ? KnowledgeSourceKind.RSS
        : KnowledgeSourceKind.URL,
    );
    const interval = source?.refreshIntervalMinutes ?? defaults.intervalMinutes;
    const minutes = isFailure
      ? Math.min(backoffMinutes ?? 15, interval)
      : interval;
    return new Date(now.getTime() + minutes * 60_000);
  }

  private async syncRefreshWorkflow(
    actor: KnowledgeActor,
    sourceId: string,
    title: string,
    existingWorkflowId: string | null | undefined,
    isEnabled: boolean,
  ): Promise<string | null> {
    if (existingWorkflowId) {
      const existing = await this.prisma.workflow.findFirst({
        where: {
          id: existingWorkflowId,
          isDeleted: false,
          organizationId: actor.organizationId,
        },
      });
      if (existing) {
        await this.prisma.workflow.update({
          where: { id: existing.id },
          data: {
            isScheduleEnabled: isEnabled,
            schedule: KNOWLEDGE_REFRESH_SCHEDULE_CRON,
            timezone: 'UTC',
          },
        });
        await this.workflowQueue?.syncWorkflowScheduler({
          id: existing.id,
          isDeleted: false,
          isScheduleEnabled: isEnabled,
          schedule: KNOWLEDGE_REFRESH_SCHEDULE_CRON,
          status: WorkflowStatus.ACTIVE,
          timezone: 'UTC',
        });
        return existing.id;
      }
    }
    if (!isEnabled || !this.workflows || !actor.brandId) {
      return existingWorkflowId ?? null;
    }
    const created = await this.workflows.createWorkflow(
      actor.userId,
      actor.organizationId,
      {
        brandId: actor.brandId,
        inputVariables: [
          {
            defaultValue: sourceId,
            description: 'Knowledge source to refresh.',
            key: 'sourceId',
            label: 'Source ID',
            required: true,
            type: 'text',
          },
        ],
        isScheduleEnabled: true,
        label: `Refresh ${title}`,
        metadata: {
          knowledgeSourceId: sourceId,
          sourceTemplateId: 'source-maintenance',
        },
        schedule: KNOWLEDGE_REFRESH_SCHEDULE_CRON,
        templateId: 'source-maintenance',
        timezone: 'UTC',
      },
    );
    return created.id;
  }

  private toSafeError(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    if (/404|410|gone/i.test(message)) return SAFE_ERRORS.missing;
    if (/401|403|denied/i.test(message)) return SAFE_ERRORS.denied;
    if (/429|rate/i.test(message)) return SAFE_ERRORS.rateLimited;
    if (/timeout|abort/i.test(message)) return SAFE_ERRORS.timeout;
    if (/feed/i.test(message)) return SAFE_ERRORS.invalidFeed;
    if (/size|byte/i.test(message)) return SAFE_ERRORS.tooLarge;
    if (message.includes('Failed to fetch')) return SAFE_ERRORS.network;
    return SAFE_ERRORS.ingestion;
  }

  private readPayloadUrl(value: unknown): string | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return undefined;
    }
    const record = value as Record<string, unknown>;
    const url = record.referenceUrl ?? record.url;
    return typeof url === 'string' && url ? url : undefined;
  }

  private readFingerprint(value: unknown): string | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return undefined;
    }
    const fingerprint = (value as { contentFingerprint?: unknown })
      .contentFingerprint;
    return typeof fingerprint === 'string' ? fingerprint : undefined;
  }

  private async readOrigin(
    sourceId: string,
    organizationId: string,
  ): Promise<string | null> {
    const version = await this.prisma.knowledgeSourceVersion.findFirst({
      where: {
        isCurrent: true,
        isDeleted: false,
        organizationId,
        sourceId,
      },
    });
    return (
      this.readPayloadUrl(version?.payload) ??
      this.readPayloadUrl(version?.provenance) ??
      null
    );
  }
}

export function knowledgeRefreshTickKey(
  sourceId: string,
  fireId: string,
): string {
  return `${sourceId}:${fireId}`;
}
