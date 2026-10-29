import { ClipperProjectsService } from '@api/collections/clipper-projects/clipper-projects.service';
import { ClipperLibraryLinkService } from '@api/collections/clipper-projects/services/clipper-library-link.service';
import {
  getRawCutCaptionJobId,
  getRawCutFramingJobId,
  RawCutClipService,
} from '@api/collections/clipper-projects/services/raw-cut-clip.service';
import { ClipperResultsService } from '@api/collections/clipper-results/clipper-results.service';
import type { ClipperResultDocument } from '@api/collections/clipper-results/schemas/clipper-result.schema';
import { isTerminalClipStatus } from '@api/collections/clipper-shared/clipper-terminal-contract.util';
import { buildCaptionBurnStyleFromConfig } from '@api/collections/workflows/utils/caption-burn-style.util';
import { scopedWhere } from '@api/index';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { FileQueueService } from '@api/services/files-microservice/queue/file-queue.service';
import { JobState, Status } from '@genfeedai/contracts';
import type {
  ClipRawCutFramingContract,
  ClipRawCutMediaValidationContract,
  ICaptionBurnStyle,
  IJobStatusResponse,
} from '@genfeedai/contracts/interfaces';
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
    private readonly clipperLibraryLinkService: ClipperLibraryLinkService,
    private readonly clipperProjectsService: ClipperProjectsService,
    private readonly clipperResultsService: ClipperResultsService,
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

    const clipperResult = await this.clipperResultsService.findOne(
      scopedWhere(organizationId, { id: event.ingredientId }),
    );

    if (clipperResult?.mode !== 'raw-cut') {
      return false;
    }

    const clipperResultId = this.readId(clipperResult);
    const projectId = this.readString(clipperResult.projectId);
    const currentJobId = this.readString(clipperResult.providerJobId);
    const eventJobId = this.readString(event.result?.jobId);
    const eventJobType = this.readString(event.result?.jobType);
    const status = this.readString(clipperResult.status);

    if (status && isTerminalClipStatus(status)) {
      await this.reconcileProjectIfPending(clipperResult);
      if (status === 'completed') {
        await this.linkLibraryAsset(clipperResultId, organizationId);
      }
      this.logger.log(`${this.logContext} ignored terminal completion replay`, {
        clipperResultId,
        eventJobId,
        status,
      });
      return true;
    }

    if (eventJobId && currentJobId && eventJobId !== currentJobId) {
      this.logger.log(`${this.logContext} ignored stale completion event`, {
        clipperResultId,
        currentJobId,
        eventJobId,
      });
      return true;
    }

    try {
      if (event.status === Status.FAILED) {
        if (!this.isEventForStage(status, eventJobType)) {
          this.logOutOfStageEvent(clipperResultId, eventJobType, status);
          return true;
        }
        await this.failClip(
          clipperResultId,
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
        await this.completeTrim(clipperResult, { ...event, organizationId });
        return true;
      }

      if (
        status === 'captioning' &&
        (!eventJobType || eventJobType === 'add-captions')
      ) {
        await this.completeCaption(clipperResult, { ...event, organizationId });
        return true;
      }

      if (
        status === 'reframing' &&
        (!eventJobType || eventJobType === 'convert-to-portrait')
      ) {
        await this.completeFraming(clipperResult, { ...event, organizationId });
        return true;
      }
    } catch (error: unknown) {
      if (error instanceof RawCutCompletionContractError) {
        await this.failClip(
          clipperResultId,
          projectId,
          organizationId,
          error.message,
        );
        return true;
      }
      throw error;
    }

    this.logOutOfStageEvent(clipperResultId, eventJobType, status);
    return true;
  }

  async reconcileActiveClips(): Promise<void> {
    const [activeCount, pendingProjectCount] = await Promise.all([
      this.clipperResultsService.countActiveRawCuts(),
      this.clipperResultsService.countRawCutsPendingProjectReconciliation(),
    ]);
    const [activeClips, pendingProjectClips] = await Promise.all([
      activeCount > 0
        ? this.clipperResultsService.findActiveRawCuts(
            RAW_CUT_RECONCILIATION_LIMIT,
            this.getBatchOffset(activeCount),
          )
        : Promise.resolve([]),
      pendingProjectCount > 0
        ? this.clipperResultsService.findRawCutsPendingProjectReconciliation(
            RAW_CUT_RECONCILIATION_LIMIT,
            this.getBatchOffset(pendingProjectCount),
          )
        : Promise.resolve([]),
    ]);
    const results = await Promise.allSettled(
      activeClips.map(async (clipperResult) => {
        if (clipperResult.status === 'validating') {
          await this.completeValidation(clipperResult);
          return;
        }
        const jobId = this.readString(clipperResult.providerJobId);
        if (!jobId) {
          if (this.isStale(clipperResult.updatedAt)) {
            await this.failClip(
              this.readId(clipperResult),
              this.readProjectId(clipperResult),
              clipperResult.organizationId,
              'Raw-cut clip lost its processing job reference.',
            );
          }
          return;
        }

        let job: IJobStatusResponse;
        try {
          job = await this.fileQueueService.getJobStatus(jobId);
        } catch (error: unknown) {
          if (await this.redispatchCurrentStageIfPossible(clipperResult)) {
            return;
          }
          if (this.isStale(clipperResult.updatedAt)) {
            await this.failClip(
              this.readId(clipperResult),
              this.readProjectId(clipperResult),
              clipperResult.organizationId,
              'Raw-cut processing job is no longer available.',
            );
            return;
          }
          throw error;
        }

        if (job.state !== JobState.COMPLETED && job.state !== JobState.FAILED) {
          return;
        }

        const stageJobType = this.getStageJobType(clipperResult.status);
        await this.handleCompletion({
          error: job.failedReason,
          ingredientId: this.readId(clipperResult),
          organizationId: clipperResult.organizationId,
          result: {
            ...this.readResult(job),
            jobId,
            jobType: stageJobType,
          },
          status:
            job.state === JobState.COMPLETED ? Status.COMPLETED : Status.FAILED,
          userId: this.readCanonicalUserId(clipperResult),
        });
      }),
    );

    const pendingProjectResults = await Promise.allSettled(
      pendingProjectClips.map(async (clipperResult) => {
        await this.reconcileProjectIfPending(clipperResult);
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
    clipperResult: ClipperResultDocument,
    event: RawCutVideoCompletionEvent,
  ): Promise<void> {
    const clipperResultId = this.readId(clipperResult);
    const projectId = this.requireProjectId(clipperResult);
    const { s3Key, url } = this.readOutput(event.result, 'trim');
    const userId = event.userId ?? this.readCanonicalUserId(clipperResult);

    if (!userId) {
      await this.failClip(
        clipperResultId,
        projectId,
        event.organizationId,
        'Raw-cut clip is missing its canonical user id.',
      );
      return;
    }

    const framingJobId = getRawCutFramingJobId(clipperResultId);
    const framingJob = await this.fileQueueService.processVideo({
      id: framingJobId,
      ingredientId: clipperResultId,
      organizationId: event.organizationId,
      params: {
        framingMode: 'contain-blur',
        height: 1920,
        s3Key,
        width: 1080,
      },
      room: this.readString(clipperResult.room),
      type: 'convert-to-portrait',
      userId,
      websocketUrl: `/clips/${clipperResultId}`,
    });

    await this.clipperResultsService.patch(
      clipperResultId,
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
    clipperResult: ClipperResultDocument,
    event: RawCutVideoCompletionEvent,
  ): Promise<void> {
    const clipperResultId = this.readId(clipperResult);
    const projectId = this.requireProjectId(clipperResult);
    const { s3Key, url } = this.readOutput(event.result, 'framing');
    const captionSrt = this.readString(clipperResult.captionSrt);
    const userId = event.userId ?? this.readCanonicalUserId(clipperResult);

    if (!captionSrt) {
      await this.failClip(
        clipperResultId,
        projectId,
        event.organizationId,
        'Raw-cut clip is missing its caption track.',
      );
      return;
    }
    if (!userId) {
      await this.failClip(
        clipperResultId,
        projectId,
        event.organizationId,
        'Raw-cut clip is missing its canonical user id.',
      );
      return;
    }

    const captionJob = await this.fileQueueService.processVideo({
      id: getRawCutCaptionJobId(clipperResultId),
      ingredientId: clipperResultId,
      organizationId: event.organizationId,
      params: {
        captionContent: captionSrt,
        captionStyle: await this.readCaptionStyle(
          projectId,
          event.organizationId,
        ),
        s3Key,
      },
      room: this.readString(clipperResult.room),
      type: 'add-captions',
      userId,
      websocketUrl: `/clips/${clipperResultId}`,
    });
    const framing: ClipRawCutFramingContract = {
      aspectRatio: '9:16',
      height: 1920,
      strategy: 'contain-blur',
      subjectSafety: 'full-source-visible',
      version: 1,
      width: 1080,
    };

    await this.clipperResultsService.patch(
      clipperResultId,
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
    clipperResult: ClipperResultDocument,
    event: RawCutVideoCompletionEvent,
  ): Promise<void> {
    const clipperResultId = this.readId(clipperResult);
    const { s3Key, url } = this.readOutput(event.result, 'caption');

    await this.clipperResultsService.patch(
      clipperResultId,
      {
        captionedVideoS3Key: s3Key,
        captionedVideoUrl: url,
        status: 'validating',
      },
      [],
      event.organizationId,
    );
    await this.completeValidation({
      ...clipperResult,
      captionedVideoS3Key: s3Key,
      captionedVideoUrl: url,
      status: 'validating',
    });
  }

  private async completeValidation(
    clipperResult: ClipperResultDocument,
  ): Promise<void> {
    const clipperResultId = this.readId(clipperResult);
    const projectId = this.requireProjectId(clipperResult);
    const organizationId = clipperResult.organizationId;
    const s3Key = this.readString(clipperResult.captionedVideoS3Key);
    const url = this.readString(clipperResult.captionedVideoUrl);
    if (!s3Key || !url) {
      await this.failClip(
        clipperResultId,
        projectId,
        organizationId,
        'Raw-cut validation is missing its canonical captioned media.',
      );
      return;
    }

    const validation = await this.validateCaptionedOutput(clipperResult, url);
    const completed = validation.status === 'passed';
    await this.clipperResultsService.patch(
      clipperResultId,
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
      await this.linkLibraryAsset(clipperResultId, organizationId);
    }
    await this.reconcileProject(clipperResultId, projectId, organizationId);
  }

  private async linkLibraryAsset(
    clipperResultId: string,
    organizationId: string,
  ): Promise<void> {
    const result = await this.clipperLibraryLinkService.linkReadyClip({
      clipperResultId,
      organizationId,
    });
    if (result.status !== 'linked') {
      this.logger.warn(`${this.logContext} Library link did not complete`, {
        clipperResultId,
        error: result.error,
        status: result.status,
      });
    }
  }

  private async failClip(
    clipperResultId: string,
    projectId: string | undefined,
    organizationId: string,
    error: string,
  ): Promise<void> {
    const isProjectReconciliationPending = Boolean(projectId);
    await this.clipperResultsService.patch(
      clipperResultId,
      {
        error,
        isProjectReconciliationPending,
        status: 'failed',
      },
      [],
      organizationId,
    );

    if (projectId) {
      await this.reconcileProject(clipperResultId, projectId, organizationId);
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
    clipperResult: ClipperResultDocument,
  ): Promise<boolean> {
    if (clipperResult.status === 'reframing') {
      return this.redispatchFramingIfPossible(clipperResult);
    }
    if (clipperResult.status === 'captioning') {
      return this.redispatchCaptionIfPossible(clipperResult);
    }
    if (clipperResult.status !== 'extracting') return false;

    const captionSrt = this.readString(clipperResult.captionSrt);
    const endTime = this.readNumber(clipperResult.endTime);
    const sourceVideoS3Key = this.readString(clipperResult.sourceVideoS3Key);
    const sourceVideoUrl = this.readString(clipperResult.sourceVideoUrl);
    const startTime = this.readNumber(clipperResult.startTime);
    const userId = this.readCanonicalUserId(clipperResult);

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
      clipperResultId: this.readId(clipperResult),
      endTime,
      organizationId: clipperResult.organizationId,
      room: this.readString(clipperResult.room),
      sourceVideoS3Key,
      sourceVideoUrl,
      startTime,
      userId,
    });
    await this.clipperResultsService.patch(
      this.readId(clipperResult),
      { providerJobId: dispatch.jobId },
      [],
      clipperResult.organizationId,
    );
    return true;
  }

  private async redispatchFramingIfPossible(
    clipperResult: ClipperResultDocument,
  ): Promise<boolean> {
    const s3Key = this.readString(clipperResult.videoS3Key);
    const userId = this.readCanonicalUserId(clipperResult);
    if (!s3Key || !userId) return false;
    const response = await this.fileQueueService.processVideo({
      id: getRawCutFramingJobId(this.readId(clipperResult)),
      ingredientId: this.readId(clipperResult),
      organizationId: clipperResult.organizationId,
      params: { framingMode: 'contain-blur', height: 1920, s3Key, width: 1080 },
      room: this.readString(clipperResult.room),
      type: 'convert-to-portrait',
      userId,
      websocketUrl: `/clips/${this.readId(clipperResult)}`,
    });
    await this.clipperResultsService.patch(
      this.readId(clipperResult),
      { providerJobId: response.jobId },
      [],
      clipperResult.organizationId,
    );
    return true;
  }

  private async redispatchCaptionIfPossible(
    clipperResult: ClipperResultDocument,
  ): Promise<boolean> {
    const captionSrt = this.readString(clipperResult.captionSrt);
    const s3Key = this.readString(clipperResult.videoS3Key);
    const userId = this.readCanonicalUserId(clipperResult);
    if (!captionSrt || !s3Key || !userId) return false;
    const response = await this.fileQueueService.processVideo({
      id: getRawCutCaptionJobId(this.readId(clipperResult)),
      ingredientId: this.readId(clipperResult),
      organizationId: clipperResult.organizationId,
      params: {
        captionContent: captionSrt,
        captionStyle: await this.readCaptionStyle(
          this.readProjectId(clipperResult),
          clipperResult.organizationId,
        ),
        s3Key,
      },
      room: this.readString(clipperResult.room),
      type: 'add-captions',
      userId,
      websocketUrl: `/clips/${this.readId(clipperResult)}`,
    });
    await this.clipperResultsService.patch(
      this.readId(clipperResult),
      { providerJobId: response.jobId },
      [],
      clipperResult.organizationId,
    );
    return true;
  }

  private readId(clipperResult: ClipperResultDocument): string {
    return String(clipperResult.id);
  }

  private requireProjectId(clipperResult: ClipperResultDocument): string {
    const projectId = this.readProjectId(clipperResult);
    if (!projectId) {
      throw new RawCutCompletionContractError(
        'Raw-cut clip result is missing its project id.',
      );
    }
    return projectId;
  }

  /** The project's caption look; every clip of a project is captioned alike. */
  private async readCaptionStyle(
    projectId: string | undefined,
    organizationId: string,
  ): Promise<ICaptionBurnStyle> {
    const project = projectId
      ? await this.clipperProjectsService.findOne({
          id: projectId,
          organizationId,
        })
      : null;
    const preset = this.readString(project?.captionStyle);
    return buildCaptionBurnStyleFromConfig({
      style: preset === 'default' ? 'dynamic' : preset,
    });
  }

  private async reconcileProject(
    clipperResultId: string,
    projectId: string,
    organizationId: string,
  ): Promise<void> {
    await this.clipperProjectsService.reconcileTerminalState(
      projectId,
      organizationId,
    );
    await this.clipperResultsService.patch(
      clipperResultId,
      { isProjectReconciliationPending: false },
      [],
      organizationId,
    );
  }

  private async reconcileProjectIfPending(
    clipperResult: ClipperResultDocument,
  ): Promise<void> {
    if (clipperResult.isProjectReconciliationPending !== true) {
      return;
    }
    const projectId = this.readProjectId(clipperResult);
    if (!projectId) {
      await this.clipperResultsService.patch(
        this.readId(clipperResult),
        { isProjectReconciliationPending: false },
        [],
        clipperResult.organizationId,
      );
      return;
    }
    await this.reconcileProject(
      this.readId(clipperResult),
      projectId,
      clipperResult.organizationId,
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
    clipperResult: ClipperResultDocument,
    url: string,
  ): Promise<ClipRawCutMediaValidationContract> {
    const expectedDurationSeconds =
      this.readNumber(clipperResult.duration) ??
      Math.max(
        0,
        (this.readNumber(clipperResult.endTime) ?? 0) -
          (this.readNumber(clipperResult.startTime) ?? 0),
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
    if (!this.readString(clipperResult.captionSrt)) {
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
    clipperResultId: string,
    eventJobType: string | undefined,
    status: string | undefined,
  ): void {
    this.logger.log(
      `${this.logContext} ignored out-of-stage completion event`,
      { clipperResultId, eventJobType, status },
    );
  }

  private readCanonicalUserId(
    clipperResult: ClipperResultDocument,
  ): string | undefined {
    return this.readString(clipperResult.userId);
  }

  private readProjectId(
    clipperResult: ClipperResultDocument,
  ): string | undefined {
    return this.readString(clipperResult.projectId);
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
