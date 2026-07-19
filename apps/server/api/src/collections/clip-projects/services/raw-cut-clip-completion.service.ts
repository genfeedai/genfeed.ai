import { ClipProjectsService } from '@api/collections/clip-projects/clip-projects.service';
import {
  getRawCutCaptionJobId,
  RawCutClipService,
} from '@api/collections/clip-projects/services/raw-cut-clip.service';
import { ClipResultsService } from '@api/collections/clip-results/clip-results.service';
import type { ClipResultDocument } from '@api/collections/clip-results/schemas/clip-result.schema';
import { isTerminalClipStatus } from '@api/collections/clip-shared/clip-terminal-contract.util';
import { FileQueueService } from '@api/services/files-microservice/queue/file-queue.service';
import { JobState, Status } from '@genfeedai/enums';
import type { IJobStatusResponse } from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

export interface RawCutVideoCompletionEvent {
  error?: string;
  ingredientId: string;
  organizationId: string;
  result?: Record<string, unknown>;
  status: Status.COMPLETED | Status.FAILED;
  userId?: string;
}

const RAW_CUT_RECONCILIATION_LIMIT = 100;
const RAW_CUT_STALE_MS = 2 * 60 * 60 * 1000;

class RawCutCompletionContractError extends Error {}

@Injectable()
export class RawCutClipCompletionService {
  private readonly logContext = 'RawCutClipCompletionService';

  constructor(
    private readonly clipProjectsService: ClipProjectsService,
    private readonly clipResultsService: ClipResultsService,
    private readonly fileQueueService: FileQueueService,
    private readonly rawCutClipService: RawCutClipService,
    private readonly logger: LoggerService,
  ) {}

  async handleCompletion(event: RawCutVideoCompletionEvent): Promise<boolean> {
    const organizationId = this.readString(event.organizationId);
    if (!organizationId) {
      this.logger.warn(
        `${this.logContext} ignored completion without an organization`,
        { ingredientId: event.ingredientId },
      );
      return true;
    }

    const clipResult = await this.clipResultsService.findOne({
      _id: event.ingredientId,
      isDeleted: false,
      organizationId,
    });

    if (clipResult?.mode !== 'raw-cut') {
      return false;
    }

    const clipResultId = this.readId(clipResult);
    const projectId = this.readString(
      clipResult.projectId ?? clipResult.project,
    );
    const currentJobId = this.readString(clipResult.providerJobId);
    const eventJobId = this.readString(event.result?.jobId);
    const eventJobType = this.readString(event.result?.jobType);
    const status = this.readString(clipResult.status);

    if (status && isTerminalClipStatus(status)) {
      await this.reconcileProjectIfPending(clipResult);
      this.logger.log(`${this.logContext} ignored terminal completion replay`, {
        clipResultId,
        eventJobId,
        status,
      });
      return true;
    }

    if (eventJobId && currentJobId && eventJobId !== currentJobId) {
      this.logger.log(`${this.logContext} ignored stale completion event`, {
        clipResultId,
        currentJobId,
        eventJobId,
      });
      return true;
    }

    try {
      if (event.status === Status.FAILED) {
        if (!this.isEventForStage(status, eventJobType)) {
          this.logOutOfStageEvent(clipResultId, eventJobType, status);
          return true;
        }
        await this.failClip(
          clipResultId,
          projectId,
          organizationId,
          event.error ?? 'Raw-cut media processing failed.',
        );
        return true;
      }

      if (
        status === 'extracting' &&
        (!eventJobType || eventJobType === 'clip-trim')
      ) {
        await this.completeTrim(clipResult, { ...event, organizationId });
        return true;
      }

      if (
        status === 'captioning' &&
        (!eventJobType || eventJobType === 'add-captions')
      ) {
        await this.completeCaption(clipResult, { ...event, organizationId });
        return true;
      }
    } catch (error: unknown) {
      if (error instanceof RawCutCompletionContractError) {
        await this.failClip(
          clipResultId,
          projectId,
          organizationId,
          error.message,
        );
        return true;
      }
      throw error;
    }

    this.logOutOfStageEvent(clipResultId, eventJobType, status);
    return true;
  }

  async reconcileActiveClips(): Promise<void> {
    const [activeCount, pendingProjectCount] = await Promise.all([
      this.clipResultsService.countActiveRawCuts(),
      this.clipResultsService.countRawCutsPendingProjectReconciliation(),
    ]);
    const [activeClips, pendingProjectClips] = await Promise.all([
      activeCount > 0
        ? this.clipResultsService.findActiveRawCuts(
            RAW_CUT_RECONCILIATION_LIMIT,
            this.getBatchOffset(activeCount),
          )
        : Promise.resolve([]),
      pendingProjectCount > 0
        ? this.clipResultsService.findRawCutsPendingProjectReconciliation(
            RAW_CUT_RECONCILIATION_LIMIT,
            this.getBatchOffset(pendingProjectCount),
          )
        : Promise.resolve([]),
    ]);
    const results = await Promise.allSettled(
      activeClips.map(async (clipResult) => {
        const jobId = this.readString(clipResult.providerJobId);
        if (!jobId) {
          if (this.isStale(clipResult.updatedAt)) {
            await this.failClip(
              this.readId(clipResult),
              this.readProjectId(clipResult),
              clipResult.organizationId,
              'Raw-cut clip lost its processing job reference.',
            );
          }
          return;
        }

        let job: IJobStatusResponse;
        try {
          job = await this.fileQueueService.getJobStatus(jobId);
        } catch (error: unknown) {
          if (await this.redispatchTrimIfPossible(clipResult)) {
            return;
          }
          if (this.isStale(clipResult.updatedAt)) {
            await this.failClip(
              this.readId(clipResult),
              this.readProjectId(clipResult),
              clipResult.organizationId,
              'Raw-cut processing job is no longer available.',
            );
            return;
          }
          throw error;
        }

        if (job.state !== JobState.COMPLETED && job.state !== JobState.FAILED) {
          return;
        }

        const stageJobType =
          clipResult.status === 'captioning' ? 'add-captions' : 'clip-trim';
        await this.handleCompletion({
          error: job.failedReason,
          ingredientId: this.readId(clipResult),
          organizationId: clipResult.organizationId,
          result: {
            ...this.readResult(job),
            jobId,
            jobType: stageJobType,
          },
          status:
            job.state === JobState.COMPLETED ? Status.COMPLETED : Status.FAILED,
          userId: this.readCanonicalUserId(clipResult),
        });
      }),
    );

    const pendingProjectResults = await Promise.allSettled(
      pendingProjectClips.map(async (clipResult) => {
        await this.reconcileProjectIfPending(clipResult);
      }),
    );

    for (const result of [...results, ...pendingProjectResults]) {
      if (result.status === 'rejected') {
        this.logger.error(
          `${this.logContext} failed to reconcile raw-cut clip`,
          result.reason,
        );
      }
    }
  }

  private async completeTrim(
    clipResult: ClipResultDocument,
    event: RawCutVideoCompletionEvent,
  ): Promise<void> {
    const clipResultId = this.readId(clipResult);
    const projectId = this.requireProjectId(clipResult);
    const { s3Key, url } = this.readOutput(event.result, 'trim');
    const captionSrt = this.readString(clipResult.captionSrt);
    const userId = event.userId ?? this.readCanonicalUserId(clipResult);

    if (!captionSrt) {
      await this.failClip(
        clipResultId,
        projectId,
        event.organizationId,
        'Raw-cut clip is missing its caption track.',
      );
      return;
    }

    if (!userId) {
      await this.failClip(
        clipResultId,
        projectId,
        event.organizationId,
        'Raw-cut clip is missing its canonical user id.',
      );
      return;
    }

    const captionJobId = getRawCutCaptionJobId(clipResultId);
    const captionJob = await this.fileQueueService.processVideo({
      authProviderUserId: this.readString(clipResult.authProviderUserId),
      id: captionJobId,
      ingredientId: clipResultId,
      organizationId: event.organizationId,
      params: {
        captionContent: captionSrt,
        s3Key,
      },
      room: this.readString(clipResult.room),
      type: 'add-captions',
      userId,
      websocketUrl: `/clips/${clipResultId}`,
    });

    await this.clipResultsService.patch(clipResultId, {
      providerJobId: captionJob.jobId,
      status: 'captioning',
      videoS3Key: s3Key,
      videoUrl: url,
    });
  }

  private async completeCaption(
    clipResult: ClipResultDocument,
    event: RawCutVideoCompletionEvent,
  ): Promise<void> {
    const clipResultId = this.readId(clipResult);
    const projectId = this.requireProjectId(clipResult);
    const { s3Key, url } = this.readOutput(event.result, 'caption');

    await this.clipResultsService.patch(clipResultId, {
      captionedVideoS3Key: s3Key,
      captionedVideoUrl: url,
      isProjectReconciliationPending: true,
      status: 'completed',
    });
    await this.reconcileProject(clipResultId, projectId, event.organizationId);
  }

  private async failClip(
    clipResultId: string,
    projectId: string | undefined,
    organizationId: string,
    error: string,
  ): Promise<void> {
    const isProjectReconciliationPending = Boolean(projectId);
    await this.clipResultsService.patch(clipResultId, {
      error,
      isProjectReconciliationPending,
      status: 'failed',
    });

    if (projectId) {
      await this.reconcileProject(clipResultId, projectId, organizationId);
    }
  }

  private readOutput(
    result: Record<string, unknown> | undefined,
    stage: 'caption' | 'trim',
  ): { s3Key: string; url: string } {
    const s3Key = this.readString(result?.s3Key);
    const url = this.readString(result?.url);

    if (!s3Key || !url) {
      throw new RawCutCompletionContractError(
        `Raw-cut ${stage} job completed without a storage key and URL.`,
      );
    }

    return { s3Key, url };
  }

  private readResult(job: IJobStatusResponse): Record<string, unknown> {
    return job.result !== null &&
      typeof job.result === 'object' &&
      !Array.isArray(job.result)
      ? (job.result as Record<string, unknown>)
      : {};
  }

  private async redispatchTrimIfPossible(
    clipResult: ClipResultDocument,
  ): Promise<boolean> {
    if (clipResult.status !== 'extracting') {
      return false;
    }

    const captionSrt = this.readString(clipResult.captionSrt);
    const endTime = this.readNumber(clipResult.endTime);
    const sourceVideoS3Key = this.readString(clipResult.sourceVideoS3Key);
    const sourceVideoUrl = this.readString(clipResult.sourceVideoUrl);
    const startTime = this.readNumber(clipResult.startTime);
    const userId = this.readCanonicalUserId(clipResult);

    if (
      !captionSrt ||
      endTime === undefined ||
      (!sourceVideoS3Key && !sourceVideoUrl) ||
      startTime === undefined ||
      !userId
    ) {
      return false;
    }

    const dispatch = await this.rawCutClipService.dispatchClip({
      authProviderUserId: this.readString(clipResult.authProviderUserId),
      captionSrt,
      clipResultId: this.readId(clipResult),
      endTime,
      organizationId: clipResult.organizationId,
      room: this.readString(clipResult.room),
      sourceVideoS3Key,
      sourceVideoUrl,
      startTime,
      userId,
    });
    await this.clipResultsService.patch(this.readId(clipResult), {
      providerJobId: dispatch.jobId,
    });
    return true;
  }

  private readId(clipResult: ClipResultDocument): string {
    return String(clipResult.id ?? clipResult._id);
  }

  private requireProjectId(clipResult: ClipResultDocument): string {
    const projectId = this.readProjectId(clipResult);
    if (!projectId) {
      throw new RawCutCompletionContractError(
        'Raw-cut clip result is missing its project id.',
      );
    }
    return projectId;
  }

  private async reconcileProject(
    clipResultId: string,
    projectId: string,
    organizationId: string,
  ): Promise<void> {
    await this.clipProjectsService.reconcileTerminalState(
      projectId,
      organizationId,
    );
    await this.clipResultsService.patch(clipResultId, {
      isProjectReconciliationPending: false,
    });
  }

  private async reconcileProjectIfPending(
    clipResult: ClipResultDocument,
  ): Promise<void> {
    if (clipResult.isProjectReconciliationPending !== true) {
      return;
    }
    const projectId = this.readProjectId(clipResult);
    if (!projectId) {
      await this.clipResultsService.patch(this.readId(clipResult), {
        isProjectReconciliationPending: false,
      });
      return;
    }
    await this.reconcileProject(
      this.readId(clipResult),
      projectId,
      clipResult.organizationId,
    );
  }

  private getBatchOffset(count: number): number {
    if (count <= RAW_CUT_RECONCILIATION_LIMIT) {
      return 0;
    }
    const minute = Math.floor(Date.now() / 60_000);
    return (minute * RAW_CUT_RECONCILIATION_LIMIT) % count;
  }

  private isEventForStage(
    status: string | undefined,
    eventJobType: string | undefined,
  ): boolean {
    if (!eventJobType) {
      return status === 'extracting' || status === 'captioning';
    }
    return (
      (status === 'extracting' && eventJobType === 'clip-trim') ||
      (status === 'captioning' && eventJobType === 'add-captions')
    );
  }

  private isStale(updatedAt: Date): boolean {
    return Date.now() - updatedAt.getTime() >= RAW_CUT_STALE_MS;
  }

  private logOutOfStageEvent(
    clipResultId: string,
    eventJobType: string | undefined,
    status: string | undefined,
  ): void {
    this.logger.log(
      `${this.logContext} ignored out-of-stage completion event`,
      { clipResultId, eventJobType, status },
    );
  }

  private readCanonicalUserId(
    clipResult: ClipResultDocument,
  ): string | undefined {
    return this.readString(clipResult.userId ?? clipResult.user);
  }

  private readProjectId(clipResult: ClipResultDocument): string | undefined {
    return this.readString(clipResult.projectId ?? clipResult.project);
  }

  private readNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value)
      ? value
      : undefined;
  }

  private readString(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }
}
