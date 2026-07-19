import { ClipProjectsService } from '@api/collections/clip-projects/clip-projects.service';
import { ClipResultsService } from '@api/collections/clip-results/clip-results.service';
import type { ClipResultDocument } from '@api/collections/clip-results/schemas/clip-result.schema';
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

@Injectable()
export class RawCutClipCompletionService {
  private readonly logContext = 'RawCutClipCompletionService';

  constructor(
    private readonly clipProjectsService: ClipProjectsService,
    private readonly clipResultsService: ClipResultsService,
    private readonly fileQueueService: FileQueueService,
    private readonly logger: LoggerService,
  ) {}

  async handleCompletion(event: RawCutVideoCompletionEvent): Promise<boolean> {
    const clipResult = await this.clipResultsService.findOne({
      _id: event.ingredientId,
      isDeleted: false,
      organization: event.organizationId,
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
        await this.failClip(
          clipResultId,
          projectId,
          event.organizationId,
          event.error ?? 'Raw-cut media processing failed.',
        );
        return true;
      }

      if (
        clipResult.status === 'extracting' &&
        (!eventJobType || eventJobType === 'clip-trim')
      ) {
        await this.completeTrim(clipResult, event);
        return true;
      }

      if (
        clipResult.status === 'captioning' &&
        (!eventJobType || eventJobType === 'add-captions')
      ) {
        await this.completeCaption(clipResult, event);
        return true;
      }
    } catch (error: unknown) {
      await this.failClip(
        clipResultId,
        projectId,
        event.organizationId,
        error instanceof Error
          ? error.message
          : 'Raw-cut completion handling failed.',
      );
      return true;
    }

    this.logger.log(
      `${this.logContext} ignored out-of-stage completion event`,
      {
        clipResultId,
        eventJobType,
        status: clipResult.status,
      },
    );
    return true;
  }

  async reconcileActiveClips(): Promise<void> {
    const activeClips = await this.clipResultsService.findActiveRawCuts(
      RAW_CUT_RECONCILIATION_LIMIT,
    );
    const results = await Promise.allSettled(
      activeClips.map(async (clipResult) => {
        const jobId = this.readString(clipResult.providerJobId);
        if (!jobId) {
          return;
        }

        const job = await this.fileQueueService.getJobStatus(jobId);
        if (job.state !== JobState.COMPLETED && job.state !== JobState.FAILED) {
          return;
        }

        await this.handleCompletion({
          error: job.failedReason,
          ingredientId: this.readId(clipResult),
          organizationId: clipResult.organizationId,
          result: this.readResult(job),
          status:
            job.state === JobState.COMPLETED ? Status.COMPLETED : Status.FAILED,
          userId: this.readString(clipResult.user),
        });
      }),
    );

    for (const result of results) {
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
    const userId = event.userId ?? this.readString(clipResult.user);

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

    await this.clipResultsService.patch(clipResultId, {
      status: 'captioning',
      videoS3Key: s3Key,
      videoUrl: url,
    });

    try {
      const captionJobId = `raw-cut-caption-${clipResultId}`;
      const captionJob = await this.fileQueueService.processVideo({
        id: captionJobId,
        ingredientId: clipResultId,
        organizationId: event.organizationId,
        params: {
          captionContent: captionSrt,
          s3Key,
        },
        type: 'add-captions',
        userId,
        websocketUrl: `/clips/${clipResultId}`,
      });

      await this.clipResultsService.patch(clipResultId, {
        providerJobId: captionJob.jobId,
      });
    } catch (error: unknown) {
      await this.failClip(
        clipResultId,
        projectId,
        event.organizationId,
        error instanceof Error
          ? error.message
          : 'Failed to queue raw-cut captions.',
      );
    }
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
      status: 'completed',
      videoS3Key: s3Key,
      videoUrl: url,
    });
    await this.clipProjectsService.reconcileTerminalState(
      projectId,
      event.organizationId,
    );
  }

  private async failClip(
    clipResultId: string,
    projectId: string | undefined,
    organizationId: string,
    error: string,
  ): Promise<void> {
    await this.clipResultsService.patch(clipResultId, {
      error,
      status: 'failed',
    });

    if (projectId) {
      await this.clipProjectsService.reconcileTerminalState(
        projectId,
        organizationId,
      );
    }
  }

  private readOutput(
    result: Record<string, unknown> | undefined,
    stage: 'caption' | 'trim',
  ): { s3Key: string; url: string } {
    const s3Key = this.readString(result?.s3Key);
    const url = this.readString(result?.url);

    if (!s3Key || !url) {
      throw new Error(
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

  private readId(clipResult: ClipResultDocument): string {
    return String(clipResult.id ?? clipResult._id);
  }

  private requireProjectId(clipResult: ClipResultDocument): string {
    const projectId = this.readString(
      clipResult.projectId ?? clipResult.project,
    );
    if (!projectId) {
      throw new Error('Raw-cut clip result is missing its project id.');
    }
    return projectId;
  }

  private readString(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }
}
