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
import {
  CLIP_FACTORY_CONCURRENCY,
  CLIP_FACTORY_QUEUE,
  ClipFactoryJobData,
} from '@genfeedai/queue-contracts';
import {
  DEFAULT_CLIP_RESULT_MODE,
  isClipResultMode,
} from '@genfeedai/interfaces';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { ClipHighlightDetector } from '@workers/processors/api/queues/shared/clip-highlight-detector.service';

import type { Job } from 'bullmq';
import { firstValueFrom } from 'rxjs';

@Processor(CLIP_FACTORY_QUEUE, {
  concurrency: CLIP_FACTORY_CONCURRENCY,
  limiter: { duration: 60_000, max: 5 },
})
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
    const mode = data.mode ?? DEFAULT_CLIP_RESULT_MODE;

    this.logger.log(`${this.logContext} starting pipeline`, {
      jobId: job.id,
      projectId,
      youtubeUrl: data.youtubeUrl,
    });

    try {
      if (!isClipResultMode(mode)) {
        throw new Error(`Unknown clip generation mode "${mode}".`);
      }

      if (mode === 'avatar' && (!data.avatarId || !data.voiceId)) {
        throw new Error(
          'Avatar clip generation requires avatarId and voiceId.',
        );
      }

      // Stage 1: Download audio via files microservice
      await this.updateProject(projectId, {
        progress: 5,
        status: 'transcribing',
      });

      const audioUrl = await this.downloadAudio(
        data.youtubeUrl,
        data.orgId,
        data.userId,
      );
      await this.updateProject(projectId, { progress: 15 });

      this.logger.log(`${this.logContext} audio downloaded`, {
        audioUrl,
        projectId,
      });

      // Stage 2: Transcribe
      const transcription = await this.whisperService.transcribeUrl(
        audioUrl,
        data.language,
      );

      await this.updateProject(projectId, {
        progress: 35,
        status: 'analyzing',
        transcriptSegments: transcription.segments,
        transcriptSrt: transcription.srt,
        transcriptText: transcription.text,
      });

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

        await this.updateProject(projectId, {
          progress: 100,
          status: 'completed',
        });
        return;
      }

      await this.updateProject(projectId, {
        progress: 50,
        status: 'clipping',
      });

      // Stage 5: Generate clips using the requested mode
      const result = await this.clipGenerationService.generateClips({
        avatarId: data.avatarId,
        highlights: filteredHighlights,
        mode,
        orgId: data.orgId,
        projectId,
        provider: data.avatarProvider,
        sourceVideoUrl: data.youtubeUrl,
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
        await this.updateProject(projectId, {
          error: 'Clip generation failed before any generation job was queued.',
          progress: 100,
          status: 'failed',
        });
        return;
      }

      await this.updateProject(projectId, {
        progress: 60,
        status: 'generating',
      });

      this.logger.log(`${this.logContext} pipeline complete`, { projectId });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown pipeline error';

      this.logger.error(`${this.logContext} pipeline failed`, error);

      await this.updateProject(projectId, {
        error: errorMessage,
        status: 'failed',
      }).catch((updateErr: unknown) => {
        this.logger.error(
          `${this.logContext} failed to update project status`,
          updateErr,
        );
      });

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
  ): Promise<string> {
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
          organizationId,
          params: { inputPath: youtubeUrl },
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
    timeoutMs = 120_000,
  ): Promise<string> {
    const pollInterval = 2_000;
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      const response = await firstValueFrom(
        this.httpService.get(`${filesUrl}/v1/files/job/${jobId}`),
      );

      const status = response.data?.status || response.data?.data?.status;

      if (status === 'completed' || status === 'COMPLETED') {
        const result =
          response.data?.result || response.data?.data?.result || response.data;
        return result.outputUrl || result.url;
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
  ): Promise<void> {
    await this.clipProjectsService.patch(projectId, update);
  }
}
