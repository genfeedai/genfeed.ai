/**
 * Clip Analyze Processor
 *
 * BullMQ worker that runs the cheap analysis pipeline only:
 * 1. Download audio from YouTube via files microservice
 * 2. Transcribe via WhisperService (Replicate)
 * 3. Detect highlights via OpenRouter LLM (GPT-4o)
 * 4. Filter by minViralityScore
 * 5. Extract bounded reference frames from highlight timestamps
 * 6. Save highlights and reference frames (status: 'analyzed')
 *
 * Does NOT generate avatar videos — that's the clip-factory queue.
 */

import { randomUUID } from 'node:crypto';
import { ClipProjectsService } from '@server/collections/clip-projects/clip-projects.service';
import type { IHighlight } from '@server/collections/clip-projects/schemas/clip-project.schema';
import { PublicClipToolStoreService } from '@server/services/public-clip-tool/public-clip-tool-store.service';
import { WhisperService } from '@server/services/whisper/whisper.service';
import {
  CLIP_AUDIO_EXTRACTION_JOB_TIMEOUT_MS,
  CLIP_REFERENCE_FRAME_JOB_TIMEOUT_MS,
} from '@genfeedai/constants';
import {
  normalizeClipReferenceFrameSet,
  normalizeClipReferenceTimestamps,
} from '@genfeedai/helpers';
import {
  CLIP_REFERENCE_FRAME_SCHEMA_VERSION,
  type ClipReferenceFrameSet,
  type ClipSourceArtifact,
} from '@genfeedai/interfaces';
import {
  CLIP_ANALYZE_CONCURRENCY,
  CLIP_ANALYZE_QUEUE,
  ClipAnalyzeJobData,
  type ClipAnalyzeJobResult,
} from '@genfeedai/queue-contracts';
import { ConfigService } from '@libs/config/config.service';
import { withLongJobWorkerOptions } from '@libs/jobs/bullmq-worker-lock.options';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { ClipHighlightDetector } from '@workers/processors/api/queues/shared/clip-highlight-detector.service';

import type { Job } from 'bullmq';
import { firstValueFrom } from 'rxjs';

function deriveReferenceTimestamps(highlights: IHighlight[]): number[] {
  return normalizeClipReferenceTimestamps(
    highlights
      .filter(
        (highlight) =>
          Number.isFinite(highlight.start_time) &&
          Number.isFinite(highlight.end_time) &&
          highlight.start_time >= 0 &&
          highlight.end_time >= highlight.start_time,
      )
      .map((highlight) => (highlight.start_time + highlight.end_time) / 2),
  );
}

function pendingReferenceFrames(timestamps: number[]): ClipReferenceFrameSet {
  return {
    candidates: timestamps.map((timestampSeconds, index) => ({
      assetId: `frame-${index + 1}-${Math.round(timestampSeconds * 1000)}`,
      diagnostics: [],
      id: `frame-${index + 1}-${Math.round(timestampSeconds * 1000)}`,
      status: 'pending',
      timestampSeconds,
    })),
    diagnostics: [],
    schemaVersion: CLIP_REFERENCE_FRAME_SCHEMA_VERSION,
    selectedCandidateId: null,
    status: 'pending',
  };
}

function unavailableReferenceFrames(
  code: string,
  message: string,
): ClipReferenceFrameSet {
  return {
    candidates: [],
    diagnostics: [{ code, message, severity: 'warning' }],
    schemaVersion: CLIP_REFERENCE_FRAME_SCHEMA_VERSION,
    selectedCandidateId: null,
    status: 'unavailable',
  };
}

interface AudioExtractionResult {
  audioUrl: string;
  sourceArtifact?: ClipSourceArtifact;
}

const PUBLIC_YOUTUBE_CLIP_PROJECT_PREFIX = 'public-youtube-clip-session-';

@Processor(
  CLIP_ANALYZE_QUEUE,
  withLongJobWorkerOptions({
    concurrency: CLIP_ANALYZE_CONCURRENCY,
    limiter: { duration: 60_000, max: 5 },
  }),
)
export class ClipAnalyzeProcessor extends WorkerHost {
  private readonly logContext = 'ClipAnalyzeProcessor';

  constructor(
    private readonly logger: LoggerService,
    private readonly clipProjectsService: ClipProjectsService,
    private readonly whisperService: WhisperService,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly highlightDetector: ClipHighlightDetector,
    private readonly publicClipToolStore: PublicClipToolStoreService,
  ) {
    super();
  }

  async process(job: Job<ClipAnalyzeJobData>): Promise<ClipAnalyzeJobResult> {
    const { data } = job;
    const { projectId } = data;
    let sourceCompleted = false;
    let sourceArtifact = data.source?.artifact;

    this.logger.log(`${this.logContext} starting analysis`, {
      jobId: job.id,
      projectId,
    });

    try {
      // Stage 1: Download audio via files microservice
      await this.updateProject(
        projectId,
        {
          progress: 5,
          status: 'analyzing',
        },
        data.orgId,
      );
      await this.updateSource(
        data,
        data.source?.kind === 'youtube' ? 'downloading' : 'extracting',
      );

      const sourceUrl = sourceArtifact?.mediaUrl ?? data.youtubeUrl;
      const extraction: AudioExtractionResult =
        data.source?.contentType?.startsWith('audio/')
          ? { audioUrl: sourceUrl }
          : await this.downloadAudio(
              sourceUrl,
              data.orgId,
              data.userId,
              projectId,
              data.source?.ingredientId,
              sourceArtifact?.storageKey,
            );
      const { audioUrl } = extraction;
      if (extraction.sourceArtifact) {
        sourceArtifact = extraction.sourceArtifact;
        await this.persistSourceArtifact(data, sourceArtifact);
      }
      await this.updateProject(projectId, { progress: 15 }, data.orgId);
      await this.updateSource(data, 'ready-for-transcription');

      this.logger.log(`${this.logContext} audio downloaded`, {
        projectId,
      });

      // Stage 2: Transcribe
      const transcription = await this.whisperService.transcribeUrl(
        audioUrl,
        data.language,
      );

      await this.updateProject(
        projectId,
        {
          progress: 45,
          transcriptSegments: transcription.segments,
          transcriptSrt: transcription.srt,
          transcriptText: transcription.text,
        },
        data.orgId,
      );
      await this.updateSource(data, 'completed');
      sourceCompleted = true;

      this.logger.log(`${this.logContext} transcription complete`, {
        duration: transcription.duration,
        projectId,
        segments: transcription.segments.length,
      });

      // Stage 3: Detect highlights via LLM
      const rawHighlights = await this.highlightDetector.detectHighlights(
        transcription.text,
        transcription.segments,
        data.maxClips,
        {
          fallback: data.highlightFallback,
          model: data.highlightModel,
        },
      );

      // Stage 4: Filter by virality score and assign IDs
      const highlights: IHighlight[] = rawHighlights
        .filter((h) => h.virality_score >= data.minViralityScore)
        .map((h) => ({
          ...h,
          id: randomUUID(),
        }));

      // Stage 5: Extract reference candidates without making analysis depend on
      // source video availability.
      const referenceTimestamps = deriveReferenceTimestamps(highlights);
      let referenceFrames: ClipReferenceFrameSet;

      if (
        referenceTimestamps.length === 0 ||
        data.source?.contentType?.startsWith('audio/')
      ) {
        referenceFrames = unavailableReferenceFrames(
          referenceTimestamps.length === 0
            ? 'clip_reference_no_timestamps'
            : 'clip_reference_audio_source',
          referenceTimestamps.length === 0
            ? 'No eligible highlight timestamps were available for reference extraction.'
            : 'Audio sources do not contain reference frames.',
        );
      } else {
        await this.updateProject(
          projectId,
          {
            highlights,
            progress: 75,
            referenceFrames: pendingReferenceFrames(referenceTimestamps),
          },
          data.orgId,
        );

        try {
          referenceFrames = await this.extractReferenceFrames(
            sourceArtifact?.mediaUrl ?? sourceUrl,
            data.orgId,
            data.userId,
            projectId,
            referenceTimestamps,
          );
        } catch (error: unknown) {
          this.logger.warn(
            `${this.logContext} reference extraction unavailable`,
            { error, projectId },
          );
          referenceFrames = unavailableReferenceFrames(
            'clip_reference_extraction_failed',
            'Reference frames could not be extracted from the source video.',
          );
        }
      }

      // Stage 6: Save analysis output. Reference extraction failures are
      // represented in the contract and do not discard transcript/highlights.
      await this.updateProject(
        projectId,
        {
          highlights,
          progress: 100,
          referenceFrames,
          status: 'analyzed',
        },
        data.orgId,
      );

      this.logger.log(`${this.logContext} analysis complete`, {
        highlightsCount: highlights.length,
        projectId,
      });
      return { sourceArtifact };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown analysis error';

      this.logger.error(`${this.logContext} analysis failed`, error);

      await this.updateProject(
        projectId,
        {
          error: errorMessage,
          status: 'failed',
        },
        data.orgId,
      ).catch((updateErr: unknown) => {
        this.logger.error(
          `${this.logContext} failed to update project status`,
          updateErr,
        );
      });
      if (!sourceCompleted) {
        await this.updateSource(data, 'failed', errorMessage).catch(
          (updateErr: unknown) => {
            this.logger.error(
              `${this.logContext} failed to update source status`,
              updateErr,
            );
          },
        );
      }

      throw error;
    }
  }

  private async extractReferenceFrames(
    youtubeUrl: string,
    organizationId: string,
    userId: string,
    projectId: string,
    timestamps: number[],
  ): Promise<ClipReferenceFrameSet> {
    const filesUrl = this.getFilesServiceUrl();

    const response = await firstValueFrom(
      this.httpService.post(
        `${filesUrl}/v1/files/process/video`,
        {
          id: `clip-reference-frames-${projectId}`,
          ingredientId: projectId,
          organizationId,
          params: { inputPath: youtubeUrl, timestamps },
          type: 'extract-reference-frames',
          userId,
        },
        { headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const jobId = response.data?.jobId || response.data?.data?.jobId;
    if (!jobId) {
      throw new Error(
        'Files microservice did not return a jobId for reference extraction',
      );
    }

    return this.waitForReferenceFrameJob(filesUrl, jobId);
  }

  /**
   * Download audio from a YouTube URL via the files microservice.
   */
  private async downloadAudio(
    youtubeUrl: string,
    organizationId: string,
    userId: string,
    projectId: string,
    ingredientId?: string,
    sourceS3Key?: string,
  ): Promise<AudioExtractionResult> {
    const filesUrl = this.getFilesServiceUrl();

    const response = await firstValueFrom(
      this.httpService.post(
        `${filesUrl}/v1/files/process/video`,
        {
          id: `clip-audio-${projectId}`,
          ingredientId: ingredientId ?? projectId,
          organizationId,
          params: sourceS3Key
            ? { s3Key: sourceS3Key }
            : { inputPath: youtubeUrl },
          type: 'video-to-audio',
          userId,
        },
        { headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const jobId = response.data?.jobId || response.data?.data?.jobId;

    if (!jobId) {
      throw new Error(
        'Files microservice did not return a jobId for audio extraction',
      );
    }

    return this.waitForAudioJob(filesUrl, jobId);
  }

  private getFilesServiceUrl(): string {
    const configuredFilesUrl = this.configService.get(
      'GENFEEDAI_MICROSERVICES_FILES_URL',
    ) as string | undefined;
    if (!configuredFilesUrl && !this.configService.isDevelopment) {
      throw new Error(
        'GENFEEDAI_MICROSERVICES_FILES_URL is not configured — clip analysis cannot reach the files service',
      );
    }
    return configuredFilesUrl || 'http://localhost:3012';
  }

  /**
   * Poll the files microservice until the audio extraction job completes.
   */
  private async waitForAudioJob(
    filesUrl: string,
    jobId: string,
    timeoutMs = CLIP_AUDIO_EXTRACTION_JOB_TIMEOUT_MS,
  ): Promise<AudioExtractionResult> {
    const pollInterval = 2_000;
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      const response = await firstValueFrom(
        this.httpService.get(`${filesUrl}/v1/files/job/${jobId}`),
      );

      const payload = response.data?.data || response.data;
      const status = payload?.status || payload?.state;

      if (status === 'completed' || status === 'COMPLETED') {
        const result = payload?.result || payload;
        const audioUrl = result.outputUrl || result.url;
        if (typeof audioUrl !== 'string' || audioUrl.length === 0) {
          throw new Error(
            `Audio extraction job ${jobId} completed without an output URL`,
          );
        }
        const sourceUrl = result.sourceUrl;
        const sourceS3Key = result.sourceS3Key;
        const sourceDurationSeconds = result.sourceDurationSeconds;
        return {
          audioUrl,
          ...(typeof sourceUrl === 'string' && sourceUrl.length > 0
            ? {
                sourceArtifact: {
                  contentType: 'video/mp4',
                  ...(typeof sourceDurationSeconds === 'number' &&
                  Number.isFinite(sourceDurationSeconds)
                    ? { durationSeconds: sourceDurationSeconds }
                    : {}),
                  mediaUrl: sourceUrl,
                  ...(typeof sourceS3Key === 'string' && sourceS3Key.length > 0
                    ? { storageKey: sourceS3Key }
                    : {}),
                },
              }
            : {}),
        };
      }

      if (status === 'failed' || status === 'FAILED') {
        throw new Error(`Audio extraction job ${jobId} failed`);
      }

      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    throw new Error(
      `Audio extraction job ${jobId} timed out after ${timeoutMs}ms`,
    );
  }

  private async waitForReferenceFrameJob(
    filesUrl: string,
    jobId: string,
    timeoutMs = CLIP_REFERENCE_FRAME_JOB_TIMEOUT_MS,
  ): Promise<ClipReferenceFrameSet> {
    const pollInterval = 2_000;
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      const response = await firstValueFrom(
        this.httpService.get(`${filesUrl}/v1/files/job/${jobId}`),
      );
      const payload = response.data?.data || response.data;
      const status = payload?.status || payload?.state;

      if (status === 'completed' || status === 'COMPLETED') {
        return normalizeClipReferenceFrameSet(payload?.result?.referenceFrames);
      }

      if (status === 'failed' || status === 'FAILED') {
        throw new Error(`Reference extraction job ${jobId} failed`);
      }

      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    throw new Error(
      `Reference extraction job ${jobId} timed out after ${timeoutMs}ms`,
    );
  }

  /**
   * Update clip project fields.
   */
  private async updateProject(
    projectId: string,
    update: Record<string, unknown>,
    organizationId: string,
  ): Promise<void> {
    if (projectId.startsWith(PUBLIC_YOUTUBE_CLIP_PROJECT_PREFIX)) {
      const publicUpdate = { ...update };
      if (publicUpdate.status === 'analyzed') {
        publicUpdate.status = 'ready';
      } else if (publicUpdate.status === 'pending') {
        publicUpdate.status = 'queued';
      }
      await this.publicClipToolStore.patchByWorkerProjectId(
        projectId,
        publicUpdate,
      );
      return;
    }
    await this.clipProjectsService.patch(projectId, update, [], organizationId);
  }

  private async updateSource(
    data: ClipAnalyzeJobData,
    status: NonNullable<ClipAnalyzeJobData['source']>['status'],
    errorMessage?: string,
  ): Promise<void> {
    if (!data.source) {
      return;
    }

    const source = {
      ...data.source,
      failure: errorMessage
        ? {
            code: 'clip_source_processing_failed',
            message: errorMessage,
            retryable: true,
          }
        : null,
      status,
      updatedAt: new Date().toISOString(),
    };
    data.source = source;
    await this.updateProject(
      data.projectId,
      {
        source,
      },
      data.orgId,
    );
  }

  private async persistSourceArtifact(
    data: ClipAnalyzeJobData,
    artifact: ClipSourceArtifact,
  ): Promise<void> {
    if (data.source) {
      data.source = {
        ...data.source,
        artifact,
        durationSeconds:
          artifact.durationSeconds ?? data.source.durationSeconds,
      };
    }

    await this.updateProject(
      data.projectId,
      {
        ...(data.projectId.startsWith(PUBLIC_YOUTUBE_CLIP_PROJECT_PREFIX)
          ? { sourceArtifact: artifact }
          : {}),
        ...(data.source ? { source: data.source } : {}),
        sourceVideoS3Key: artifact.storageKey,
        sourceVideoUrl: artifact.mediaUrl,
      },
      data.orgId,
    );
  }
}
