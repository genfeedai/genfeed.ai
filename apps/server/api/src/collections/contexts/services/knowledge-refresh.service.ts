import { createHash, randomUUID } from 'node:crypto';
import type { KnowledgeActor } from '@api/collections/contexts/interfaces/knowledge-actor.interface';
import { hashKnowledgeContent } from '@api/collections/contexts/services/knowledge-capture.service';
import { KnowledgeRecordsService } from '@api/collections/contexts/services/knowledge-records.service';
import { KnowledgeSourceIngestWorkflowService } from '@api/collections/contexts/services/knowledge-source-ingest-workflow.service';
import { extractSourceText } from '@api/collections/contexts/utils/extract-source-text.util';
import { softDeleteKnowledgeChunks } from '@api/collections/contexts/utils/knowledge-chunk.util';
import { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import { WorkflowsService } from '@api/collections/workflows/services/workflows.service';
import { scopedWhere } from '@api/index';
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
    const latest = await this.records.getSource(actor, sourceId);
    const refreshWorkflowId = await this.syncRefreshWorkflow(
      actor,
      sourceId,
      latest.title,
      latest.refreshWorkflowId,
      policy.isEnabled,
    );
    const written = await this.prisma.$transaction(async (tx) => {
      const lockKey = JSON.stringify([
        'knowledge-refresh-policy',
        actor.organizationId,
        sourceId,
      ]);
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))::text`;
      const locked = await tx.knowledgeSource.findFirst({
        where: scopedWhere(actor.organizationId, { id: sourceId }),
        select: { refreshWorkflowId: true },
      });
      if (
        locked?.refreshWorkflowId &&
        refreshWorkflowId &&
        locked.refreshWorkflowId !== refreshWorkflowId
      ) {
        return { count: 0, winnerId: locked.refreshWorkflowId };
      }
      const result = await tx.knowledgeSource.updateMany({
        where: scopedWhere(actor.organizationId, { id: sourceId }),
        data: {
          gracePeriodMinutes: graceMinutes,
          isRefreshEnabled: policy.isEnabled,
          nextCheckAt: policy.isEnabled
            ? new Date(Date.now() + intervalMinutes * 60_000)
            : null,
          referenceUrl,
          refreshIntervalMinutes: intervalMinutes,
          refreshWorkflowId: locked?.refreshWorkflowId ?? refreshWorkflowId,
        },
      });
      return {
        count: result.count,
        winnerId: locked?.refreshWorkflowId ?? refreshWorkflowId,
      };
    });
    // A concurrent enable may have stored a different workflow first; the
    // one this call created or reused then must stop firing.
    if (refreshWorkflowId && written.winnerId !== refreshWorkflowId) {
      await this.syncRefreshWorkflow(
        actor,
        sourceId,
        latest.title,
        refreshWorkflowId,
        false,
      );
    }
    return this.records.getSource(actor, sourceId);
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
    await this.prisma.knowledgeSource.updateMany({
      where: scopedWhere(actor.organizationId, { id: sourceId }),
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
      (source.isRefreshEnabled !== true ||
        (source.nextCheckAt !== null &&
          source.nextCheckAt !== undefined &&
          source.nextCheckAt.getTime() > Date.now()))
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
    await this.prisma.knowledgeSourceRefreshRun.updateMany({
      where: scopedWhere(actor.organizationId, { id: runId, sourceId }),
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
      where: scopedWhere(input.organizationId, {
        candidateVersionId: input.versionId,
        sourceId: input.sourceId,
      }),
    });
    if (!run) {
      return;
    }
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.knowledgeSourceVersion.updateMany({
        where: scopedWhere(input.organizationId, {
          id: { not: input.versionId },
          isCurrent: true,
          sourceId: input.sourceId,
        }),
        data: {
          isCurrent: false,
          retrievalState: KnowledgeRetrievalState.SUPERSEDED,
          supersededByVersionId: input.versionId,
        },
      });
      await tx.knowledgeSourceVersion.updateMany({
        where: scopedWhere(input.organizationId, {
          id: input.versionId,
          sourceId: input.sourceId,
        }),
        data: {
          isCurrent: true,
          processingState: KnowledgeProcessingState.READY,
          retrievalState: KnowledgeRetrievalState.ACTIVE,
        },
      });
      await softDeleteKnowledgeChunks(tx, input.organizationId, {
        exceptVersionId: input.versionId,
        sourceId: input.sourceId,
      });
      await tx.knowledgeSourceRefreshRun.updateMany({
        where: scopedWhere(input.organizationId, {
          id: run.id,
          sourceId: input.sourceId,
        }),
        data: {
          completedAt: now,
          outcome: KnowledgeRefreshRunOutcome.CHANGED,
          status: KnowledgeRefreshRunStatus.COMPLETED,
        },
      });
      const source = await tx.knowledgeSource.findFirst({
        where: scopedWhere(input.organizationId, { id: input.sourceId }),
      });
      await tx.knowledgeSource.updateMany({
        where: scopedWhere(input.organizationId, { id: input.sourceId }),
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
      where: scopedWhere(actor.organizationId, {
        sourceId: source.id,
        tickKey,
      }),
    });
    if (existing) {
      // A failed run for this tick is retried; a live or completed one is
      // reported as-is. The claim is compare-and-set, so only one caller
      // re-executes a given run.
      if (
        await this.takeOverRun(actor.organizationId, source.id, existing.id, {
          isFailedReclaimable: true,
        })
      ) {
        return { runId: existing.id };
      }
      return {
        existingJobId: existing.candidateVersionId ?? existing.id,
        runId: existing.id,
      };
    }
    const unfinished = await this.prisma.knowledgeSourceRefreshRun.findFirst({
      where: scopedWhere(actor.organizationId, {
        sourceId: source.id,
        status: {
          in: [
            KnowledgeRefreshRunStatus.QUEUED,
            KnowledgeRefreshRunStatus.PROCESSING,
          ],
        },
      }),
    });
    if (unfinished) {
      if (
        await this.takeOverRun(actor.organizationId, source.id, unfinished.id, {
          isFailedReclaimable: false,
        })
      ) {
        await this.failRun(
          unfinished.id,
          actor.organizationId,
          source.id,
          new Error('Refresh lease expired'),
        );
      } else {
        return {
          existingJobId: unfinished.candidateVersionId ?? unfinished.id,
          runId: unfinished.id,
        };
      }
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
    await this.prisma.knowledgeSource.updateMany({
      where: scopedWhere(actor.organizationId, { id: source.id }),
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
      where: scopedWhere(organizationId, { id: sourceId }),
    });
    await this.prisma.$transaction([
      this.prisma.knowledgeSourceRefreshRun.updateMany({
        where: scopedWhere(organizationId, { id: runId, sourceId }),
        data: {
          completedAt: now,
          outcome: KnowledgeRefreshRunOutcome.UNCHANGED,
          status: KnowledgeRefreshRunStatus.COMPLETED,
        },
      }),
      this.prisma.knowledgeSource.updateMany({
        where: scopedWhere(organizationId, { id: sourceId }),
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
      where: scopedWhere(organizationId, { id: sourceId }),
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
      this.prisma.knowledgeSourceRefreshRun.updateMany({
        where: scopedWhere(organizationId, { id: runId, sourceId }),
        data: {
          completedAt: new Date(),
          error: message,
          nextAttemptAt: new Date(Date.now() + backoff * 60_000),
          status: KnowledgeRefreshRunStatus.FAILED,
        },
      }),
      this.prisma.knowledgeSource.updateMany({
        where: scopedWhere(organizationId, { id: sourceId }),
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
      where: scopedWhere(actor.organizationId, { sourceId, tickKey }),
    });
    return { refreshRunId: existing?.id ?? sourceId, sourceId };
  }

  /**
   * Atomically take over a run whose lease has expired (or, when allowed, a
   * FAILED run). Returns false when another caller holds or already took it.
   */
  private async takeOverRun(
    organizationId: string,
    sourceId: string,
    runId: string,
    options: { isFailedReclaimable: boolean },
  ): Promise<boolean> {
    const now = new Date();
    const expiredLease = {
      status: {
        in: [
          KnowledgeRefreshRunStatus.QUEUED,
          KnowledgeRefreshRunStatus.PROCESSING,
        ],
      },
      OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lte: now } }],
    };
    const taken = await this.prisma.knowledgeSourceRefreshRun.updateMany({
      where: scopedWhere(organizationId, {
        id: runId,
        sourceId,
        ...(options.isFailedReclaimable
          ? {
              OR: [{ status: KnowledgeRefreshRunStatus.FAILED }, expiredLease],
            }
          : expiredLease),
      }),
      data: {
        attemptCount: { increment: 1 },
        completedAt: null,
        error: null,
        leaseExpiresAt: new Date(now.getTime() + LEASE_MS),
        leaseToken: randomUUID(),
        startedAt: now,
        status: KnowledgeRefreshRunStatus.PROCESSING,
      },
    });
    return taken.count === 1;
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
        where: scopedWhere(actor.organizationId, { id: existingWorkflowId }),
      });
      if (existing) {
        await this.prisma.workflow.updateMany({
          where: scopedWhere(actor.organizationId, { id: existing.id }),
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
      where: scopedWhere(organizationId, {
        isCurrent: true,
        sourceId,
      }),
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
