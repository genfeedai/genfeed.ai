/**
 * Clip Factory Processor
 *
 * BullMQ worker that processes the full YouTube → AI clip pipeline:
 * 1. Download audio from YouTube via files microservice
 * 2. Transcribe via WhisperService (Replicate)
 * 3. Detect highlights via OpenRouter LLM
 * 4. Filter by minViralityScore
 * 5. Generate clips using the requested avatar or raw-cut mode
 * 6. Update ClipProject status throughout
 */
import { ClipProjectsService } from '@api/collections/clip-projects/clip-projects.service';
import { ClipGenerationService } from '@api/collections/clip-projects/services/clip-generation.service';
import { WhisperService } from '@api/services/whisper/whisper.service';
import { CLIP_AUDIO_EXTRACTION_JOB_TIMEOUT_MS } from '@genfeedai/constants';
import {
  type ClipSourceArtifact,
  DEFAULT_CLIP_RESULT_MODE,
  isClipResultMode,
} from '@genfeedai/interfaces';
import {
  CLIP_FACTORY_CONCURRENCY,
  CLIP_FACTORY_QUEUE,
  ClipFactoryJobData,
} from '@genfeedai/queue-contracts';
import { ConfigService } from '@libs/config/config.service';
import { withLongJobWorkerOptions } from '@libs/jobs/bullmq-worker-lock.options';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { ClipHighlightDetector } from '@workers/processors/api/queues/shared/clip-highlight-detector.service';

import type { Job } from 'bullmq';
import { firstValueFrom } from 'rxjs';

interface AudioExtractionResult {
  audioUrl: string;
  sourceArtifact?: ClipSourceArtifact;
}

@Processor(
  CLIP_FACTORY_QUEUE,
  withLongJobWorkerOptions({
    concurrency: CLIP_FACTORY_CONCURRENCY,
    limiter: { duration: 60_000, max: 5 },
  }),
)
export class ClipFactoryProcessor extends WorkerHost {
  private readonly logContext = 'ClipFactoryProcessor';

  constructor(
    private readonly logger: LoggerService,
    private readonly clipProjectsService: ClipProjectsService,
    private readonly clipGenerationService: ClipGenerationService,
    private readonly whisperService: WhisperService,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly highlightDetector: ClipHighlightDetector,
  ) {
    super();
  }

  async process(job: Job<ClipFactoryJobData>): Promise<void> {
    const { data } = job;
    const { projectId } = data;
    let sourceCompleted = false;
    let sourceArtifact = data.source?.artifact;
    const mode = data.mode ?? DEFAULT_CLIP_RESULT_MODE;
    const runReferences = Object.freeze(
      (data.runReferences ?? []).map((reference) =>
        Object.freeze({ ...reference }),
      ),
    );

    this.logger.log(`${this.logContext} starting pipeline`, {
      jobId: job.id,
      projectId,
    });

    try {
      if (!isClipResultMode(mode)) {
        throw new Error(`Unknown clip generation mode "${mode}".`);
      }

      if (
        mode === 'avatar' &&
        data.avatarProvider !== 'genfeedai' &&
        (!data.avatarId || !data.voiceId)
      ) {
        throw new Error(
          'Avatar clip generation requires avatarId and voiceId.',
        );
      }

      if (
        mode === 'avatar' &&
        data.avatarProvider === 'genfeedai' &&
        !data.referenceImageUrl &&
        !runReferences.some(
          (reference) =>
            reference.role === 'character' && reference.url.length > 0,
        )
      ) {
        throw new Error(
          'GenfeedAI managed clip generation requires a brand character reference.',
        );
      }

      // Stage 1: Download audio via files microservice
      await this.updateProject(
        projectId,
        {
          progress: 5,
          status: 'transcribing',
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
          progress: 35,
          status: 'analyzing',
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
      const highlights = await this.highlightDetector.detectHighlights(
        transcription.text,
        transcription.segments,
        data.maxClips,
      );

      // Stage 4: Filter by virality score
      const filteredHighlights = highlights.filter(
        (h) => h.virality_score >= data.minViralityScore,
      );

      if (filteredHighlights.length === 0) {
        this.logger.log(`${this.logContext} no highlights above threshold`, {
          minViralityScore: data.minViralityScore,
          projectId,
          totalHighlights: highlights.length,
        });

        await this.updateProject(
          projectId,
          {
            progress: 100,
            status: 'completed',
          },
          data.orgId,
        );
        return;
      }

      await this.updateProject(
        projectId,
        {
          progress: 50,
          status: 'clipping',
        },
        data.orgId,
      );

      // Stage 5: Generate clips using the requested mode
      const result = await this.clipGenerationService.generateClips({
        avatarId: data.avatarId,
        highlights: filteredHighlights,
        mode,
        orgId: data.orgId,
        projectId,
        provider: data.avatarProvider,
        referenceImageUrl: data.referenceImageUrl,
        runReferences,
        sourceVideoS3Key: sourceArtifact?.storageKey,
        sourceVideoUrl: sourceArtifact?.mediaUrl ?? sourceUrl,
        transcriptSegments: transcription.segments,
        transcriptText: transcription.text,
        userId: data.userId,
        voiceId: data.voiceId,
      });

      this.logger.log(`${this.logContext} clips generated`, {
        clipResultIds: result.clipResultIds.length,
        generationJobs: result.providerJobIds.filter(Boolean).length,
        projectId,
      });

      if (result.queuedClipCount === 0) {
        await this.updateProject(
          projectId,
          {
            error:
              'Clip generation failed before any generation job was queued.',
            progress: 100,
            status: 'failed',
          },
          data.orgId,
        );
        return;
      }

      if (
        !result.awaitingHookApproval &&
        result.completedClipCount === result.queuedClipCount
      ) {
        await this.clipProjectsService.reconcileTerminalState(
          projectId,
          data.orgId,
        );
        this.logger.log(`${this.logContext} pipeline complete`, { projectId });
        return;
      }

      await this.updateProject(
        projectId,
        {
          progress: 60,
          status: 'generating',
        },
        data.orgId,
      );

      this.logger.log(`${this.logContext} pipeline complete`, { projectId });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown pipeline error';

      this.logger.error(`${this.logContext} pipeline failed`, error);

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
    const configuredFilesUrl = this.configService.get(
      'GENFEEDAI_MICROSERVICES_FILES_URL',
    ) as string | undefined;

    // Silent localhost fallback posted audio jobs into the void on every
    // cloud deployment. Fail loud outside local development.
    if (!configuredFilesUrl && !this.configService.isDevelopment) {
      throw new Error(
        'GENFEEDAI_MICROSERVICES_FILES_URL is not configured — clip factory cannot reach the files service',
      );
    }

    const filesUrl = configuredFilesUrl || 'http://localhost:3012';

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

    // Poll for job completion
    return this.waitForAudioJob(filesUrl, jobId);
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

  /**
   * Update clip project fields.
   */
  private async updateProject(
    projectId: string,
    update: Record<string, unknown>,
    organizationId: string,
  ): Promise<void> {
    await this.clipProjectsService.patch(projectId, update, [], organizationId);
  }

  private async updateSource(
    data: ClipFactoryJobData,
    status: NonNullable<ClipFactoryJobData['source']>['status'],
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
    data: ClipFactoryJobData,
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
        ...(data.source ? { source: data.source } : {}),
        sourceVideoS3Key: artifact.storageKey,
        sourceVideoUrl: artifact.mediaUrl,
      },
      data.orgId,
    );
  }
}
