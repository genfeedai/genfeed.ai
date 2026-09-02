import { ClipProjectsService } from '@api/collections/clip-projects/clip-projects.service';
import { ClipLibraryLinkService } from '@api/collections/clip-projects/services/clip-library-link.service';
import {
  getRawCutCaptionJobId,
  getRawCutFramingJobId,
  RawCutClipService,
} from '@api/collections/clip-projects/services/raw-cut-clip.service';
import { ClipResultsService } from '@api/collections/clip-results/clip-results.service';
import type { ClipResultDocument } from '@api/collections/clip-results/schemas/clip-result.schema';
import { isTerminalClipStatus } from '@api/collections/clip-shared/clip-terminal-contract.util';
import { scopedWhere } from '@api/index';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { FileQueueService } from '@api/services/files-microservice/queue/file-queue.service';
import { JobState, Status } from '@genfeedai/enums';
import type {
  ClipRawCutFramingContract,
  ClipRawCutMediaValidationContract,
  IJobStatusResponse,
} from '@genfeedai/interfaces';
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
    private readonly clipLibraryLinkService: ClipLibraryLinkService,
    private readonly clipProjectsService: ClipProjectsService,
    private readonly clipResultsService: ClipResultsService,
    private readonly fileQueueService: FileQueueService,
    private readonly filesClientService: FilesClientService,
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

    const clipResult = await this.clipResultsService.findOne(
      scopedWhere(organizationId, { id: event.ingredientId }),
    );

    if (clipResult?.mode !== 'raw-cut') {
      return false;
    }

    const clipResultId = this.readId(clipResult);
    const projectId = this.readString(clipResult.projectId);
    const currentJobId = this.readString(clipResult.providerJobId);
    const eventJobId = this.readString(event.result?.jobId);
    const eventJobType = this.readString(event.result?.jobType);
    const status = this.readString(clipResult.status);

    if (status && isTerminalClipStatus(status)) {
      await this.reconcileProjectIfPending(clipResult);
      if (status === 'completed') {
        await this.linkLibraryAsset(clipResultId, organizationId);
      }
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

      if (
        status === 'reframing' &&
        (!eventJobType || eventJobType === 'convert-to-portrait')
      ) {
        await this.completeFraming(clipResult, { ...event, organizationId });
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
        if (clipResult.status === 'validating') {
          await this.completeValidation(clipResult);
          return;
        }
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
          if (await this.redispatchCurrentStageIfPossible(clipResult)) {
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

        const stageJobType = this.getStageJobType(clipResult.status);
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
    const userId = event.userId ?? this.readCanonicalUserId(clipResult);

    if (!userId) {
      await this.failClip(
        clipResultId,
        projectId,
        event.organizationId,
        'Raw-cut clip is missing its canonical user id.',
      );
      return;
    }

    const framingJobId = getRawCutFramingJobId(clipResultId);
    const framingJob = await this.fileQueueService.processVideo({
      id: framingJobId,
      ingredientId: clipResultId,
      organizationId: event.organizationId,
      params: {
        framingMode: 'contain-blur',
        height: 1920,
        s3Key,
        width: 1080,
      },
      room: this.readString(clipResult.room),
      type: 'convert-to-portrait',
      userId,
      websocketUrl: `/clips/${clipResultId}`,
    });

    await this.clipResultsService.patch(
      clipResultId,
      {
        providerJobId: framingJob.jobId,
        status: 'reframing',
        videoS3Key: s3Key,
        videoUrl: url,
      },
      [],
      event.organizationId,
    );
  }

  private async completeFraming(
    clipResult: ClipResultDocument,
    event: RawCutVideoCompletionEvent,
  ): Promise<void> {
    const clipResultId = this.readId(clipResult);
    const projectId = this.requireProjectId(clipResult);
    const { s3Key, url } = this.readOutput(event.result, 'framing');
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

    const captionJob = await this.fileQueueService.processVideo({
      id: getRawCutCaptionJobId(clipResultId),
      ingredientId: clipResultId,
      organizationId: event.organizationId,
      params: { captionContent: captionSrt, s3Key },
      room: this.readString(clipResult.room),
      type: 'add-captions',
      userId,
      websocketUrl: `/clips/${clipResultId}`,
    });
    const framing: ClipRawCutFramingContract = {
      aspectRatio: '9:16',
      height: 1920,
      strategy: 'contain-blur',
      subjectSafety: 'full-source-visible',
      version: 1,
      width: 1080,
    };

    await this.clipResultsService.patch(
      clipResultId,
      {
        framing,
        providerJobId: captionJob.jobId,
        status: 'captioning',
        videoS3Key: s3Key,
        videoUrl: url,
      },
      [],
      event.organizationId,
    );
  }

  private async completeCaption(
    clipResult: ClipResultDocument,
    event: RawCutVideoCompletionEvent,
  ): Promise<void> {
    const clipResultId = this.readId(clipResult);
    const { s3Key, url } = this.readOutput(event.result, 'caption');

    await this.clipResultsService.patch(
      clipResultId,
      {
        captionedVideoS3Key: s3Key,
        captionedVideoUrl: url,
        status: 'validating',
      },
      [],
      event.organizationId,
    );
    await this.completeValidation({
      ...clipResult,
      captionedVideoS3Key: s3Key,
      captionedVideoUrl: url,
      status: 'validating',
    });
  }

  private async completeValidation(
    clipResult: ClipResultDocument,
  ): Promise<void> {
    const clipResultId = this.readId(clipResult);
    const projectId = this.requireProjectId(clipResult);
    const organizationId = clipResult.organizationId;
    const s3Key = this.readString(clipResult.captionedVideoS3Key);
    const url = this.readString(clipResult.captionedVideoUrl);
    if (!s3Key || !url) {
      await this.failClip(
        clipResultId,
        projectId,
        organizationId,
        'Raw-cut validation is missing its canonical captioned media.',
      );
      return;
    }

    const validation = await this.validateCaptionedOutput(clipResult, url);
    const completed = validation.status === 'passed';
    await this.clipResultsService.patch(
      clipResultId,
      {
        captionedVideoS3Key: s3Key,
        captionedVideoUrl: url,
        error: completed ? null : validation.issues.join(' '),
        isProjectReconciliationPending: true,
        mediaValidation: validation,
        status: completed ? 'completed' : 'degraded',
      },
      [],
      organizationId,
    );
    if (completed) {
      await this.linkLibraryAsset(clipResultId, organizationId);
    }
    await this.reconcileProject(clipResultId, projectId, organizationId);
  }

  private async linkLibraryAsset(
    clipResultId: string,
    organizationId: string,
  ): Promise<void> {
    const result = await this.clipLibraryLinkService.linkReadyClip({
      clipResultId,
      organizationId,
    });
    if (result.status !== 'linked') {
      this.logger.warn(`${this.logContext} Library link did not complete`, {
        clipResultId,
        error: result.error,
        status: result.status,
      });
    }
  }

  private async failClip(
    clipResultId: string,
    projectId: string | undefined,
    organizationId: string,
    error: string,
  ): Promise<void> {
    const isProjectReconciliationPending = Boolean(projectId);
    await this.clipResultsService.patch(
      clipResultId,
      {
        error,
        isProjectReconciliationPending,
        status: 'failed',
      },
      [],
      organizationId,
    );

    if (projectId) {
      await this.reconcileProject(clipResultId, projectId, organizationId);
    }
  }

  private readOutput(
    result: Record<string, unknown> | undefined,
    stage: 'caption' | 'framing' | 'trim',
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

  private async redispatchCurrentStageIfPossible(
    clipResult: ClipResultDocument,
  ): Promise<boolean> {
    if (clipResult.status === 'reframing') {
      return this.redispatchFramingIfPossible(clipResult);
    }
    if (clipResult.status === 'captioning') {
      return this.redispatchCaptionIfPossible(clipResult);
    }
    if (clipResult.status !== 'extracting') return false;

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
    await this.clipResultsService.patch(
      this.readId(clipResult),
      { providerJobId: dispatch.jobId },
      [],
      clipResult.organizationId,
    );
    return true;
  }

  private async redispatchFramingIfPossible(
    clipResult: ClipResultDocument,
  ): Promise<boolean> {
    const s3Key = this.readString(clipResult.videoS3Key);
    const userId = this.readCanonicalUserId(clipResult);
    if (!s3Key || !userId) return false;
    const response = await this.fileQueueService.processVideo({
      id: getRawCutFramingJobId(this.readId(clipResult)),
      ingredientId: this.readId(clipResult),
      organizationId: clipResult.organizationId,
      params: { framingMode: 'contain-blur', height: 1920, s3Key, width: 1080 },
      room: this.readString(clipResult.room),
      type: 'convert-to-portrait',
      userId,
      websocketUrl: `/clips/${this.readId(clipResult)}`,
    });
    await this.clipResultsService.patch(
      this.readId(clipResult),
      { providerJobId: response.jobId },
      [],
      clipResult.organizationId,
    );
    return true;
  }

  private async redispatchCaptionIfPossible(
    clipResult: ClipResultDocument,
  ): Promise<boolean> {
    const captionSrt = this.readString(clipResult.captionSrt);
    const s3Key = this.readString(clipResult.videoS3Key);
    const userId = this.readCanonicalUserId(clipResult);
    if (!captionSrt || !s3Key || !userId) return false;
    const response = await this.fileQueueService.processVideo({
      id: getRawCutCaptionJobId(this.readId(clipResult)),
      ingredientId: this.readId(clipResult),
      organizationId: clipResult.organizationId,
      params: { captionContent: captionSrt, s3Key },
      room: this.readString(clipResult.room),
      type: 'add-captions',
      userId,
      websocketUrl: `/clips/${this.readId(clipResult)}`,
    });
    await this.clipResultsService.patch(
      this.readId(clipResult),
      { providerJobId: response.jobId },
      [],
      clipResult.organizationId,
    );
    return true;
  }

  private readId(clipResult: ClipResultDocument): string {
    return String(clipResult.id);
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
    await this.clipResultsService.patch(
      clipResultId,
      { isProjectReconciliationPending: false },
      [],
      organizationId,
    );
  }

  private async reconcileProjectIfPending(
    clipResult: ClipResultDocument,
  ): Promise<void> {
    if (clipResult.isProjectReconciliationPending !== true) {
      return;
    }
    const projectId = this.readProjectId(clipResult);
    if (!projectId) {
      await this.clipResultsService.patch(
        this.readId(clipResult),
        { isProjectReconciliationPending: false },
        [],
        clipResult.organizationId,
      );
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
      return (
        status === 'extracting' ||
        status === 'reframing' ||
        status === 'captioning'
      );
    }
    return (
      (status === 'extracting' && eventJobType === 'clip-trim') ||
      (status === 'reframing' && eventJobType === 'convert-to-portrait') ||
      (status === 'captioning' && eventJobType === 'add-captions')
    );
  }

  private getStageJobType(status: string): string {
    if (status === 'reframing') return 'convert-to-portrait';
    if (status === 'captioning') return 'add-captions';
    return 'clip-trim';
  }

  private async validateCaptionedOutput(
    clipResult: ClipResultDocument,
    url: string,
  ): Promise<ClipRawCutMediaValidationContract> {
    const expectedDurationSeconds =
      this.readNumber(clipResult.duration) ??
      Math.max(
        0,
        (this.readNumber(clipResult.endTime) ?? 0) -
          (this.readNumber(clipResult.startTime) ?? 0),
      );
    const issues: string[] = [];
    let decodeOk = false;
    let durationSeconds: number | null = null;
    let hasAudio = false;
    let height: number | null = null;
    let videoCodec: string | null = null;
    let width: number | null = null;

    const inspection = await this.filesClientService.inspectVideoQa({
      blackDurationSeconds: 0.5,
      freezeDurationSeconds: 2,
      isContactSheetEnabled: false,
      videoUrl: url,
    });
    decodeOk = inspection.decodeOk;
    const probe = JSON.parse(inspection.probeJson) as {
      format?: { duration?: string | number };
      streams?: Array<{
        codec_name?: string;
        codec_type?: string;
        height?: number;
        width?: number;
      }>;
    };
    const streams = Array.isArray(probe.streams) ? probe.streams : [];
    const video = streams.find((stream) => stream.codec_type === 'video');
    hasAudio = streams.some((stream) => stream.codec_type === 'audio');
    height = this.readNumber(video?.height) ?? null;
    width = this.readNumber(video?.width) ?? null;
    videoCodec = this.readString(video?.codec_name) ?? null;
    const rawDuration = Number(probe.format?.duration);
    durationSeconds = Number.isFinite(rawDuration) ? rawDuration : null;

    if (!decodeOk) issues.push('Rendered video is not decodable.');
    if (width !== 1080 || height !== 1920) {
      issues.push('Rendered video is not 1080x1920 portrait media.');
    }
    if (videoCodec !== 'h264') issues.push('Rendered video is not H.264.');
    if (!hasAudio) issues.push('Rendered video is missing its source audio.');
    if (
      durationSeconds === null ||
      Math.abs(durationSeconds - expectedDurationSeconds) > 0.75
    ) {
      issues.push('Rendered duration is outside the 750ms tolerance.');
    }
    if (!this.readString(clipResult.captionSrt)) {
      issues.push('Rendered clip has no caption contract.');
    }

    return {
      checkedAt: new Date().toISOString(),
      decodeOk,
      durationSeconds,
      expectedDurationSeconds,
      hasAudio,
      height,
      issues,
      status: issues.length === 0 ? 'passed' : 'failed',
      videoCodec,
      width,
    };
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
    return this.readString(clipResult.userId);
  }

  private readProjectId(clipResult: ClipResultDocument): string | undefined {
    return this.readString(clipResult.projectId);
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
