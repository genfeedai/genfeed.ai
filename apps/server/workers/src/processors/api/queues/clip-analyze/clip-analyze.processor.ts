/**
 * Clip Analyze Processor
 *
 * BullMQ worker that runs the cheap analysis pipeline only:
 * 1. Download audio from YouTube via files microservice
 * 2. Transcribe via WhisperService (Replicate)
 * 3. Detect highlights via OpenRouter LLM (GPT-4o)
 * 4. Filter by minViralityScore
 * 5. Save highlights to ClipProject (status: 'analyzed')
 *
 * Does NOT generate avatar videos — that's the clip-factory queue.
 */

import { randomUUID } from 'node:crypto';
import { ClipProjectsService } from '@api/collections/clip-projects/clip-projects.service';
import type { IHighlight } from '@api/collections/clip-projects/schemas/clip-project.schema';
import { WhisperService } from '@api/services/whisper/whisper.service';
import {
  CLIP_ANALYZE_CONCURRENCY,
  CLIP_ANALYZE_QUEUE,
  ClipAnalyzeJobData,
} from '@genfeedai/queue-contracts';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { ClipHighlightDetector } from '@workers/processors/api/queues/shared/clip-highlight-detector.service';

import type { Job } from 'bullmq';
import { firstValueFrom } from 'rxjs';

@Processor(CLIP_ANALYZE_QUEUE, {
  concurrency: CLIP_ANALYZE_CONCURRENCY,
  limiter: { duration: 60_000, max: 5 },
})
export class ClipAnalyzeProcessor extends WorkerHost {
  private readonly logContext = 'ClipAnalyzeProcessor';

  constructor(
    private readonly logger: LoggerService,
    private readonly clipProjectsService: ClipProjectsService,
    private readonly whisperService: WhisperService,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly highlightDetector: ClipHighlightDetector,
  ) {
    super();
  }

  async process(job: Job<ClipAnalyzeJobData>): Promise<void> {
    const { data } = job;
    const { projectId } = data;

    this.logger.log(`${this.logContext} starting analysis`, {
      jobId: job.id,
      projectId,
      youtubeUrl: data.youtubeUrl,
    });

    try {
      // Stage 1: Download audio via files microservice
      await this.updateProject(projectId, {
        progress: 5,
        status: 'analyzing',
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
        progress: 45,
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
      const rawHighlights = await this.highlightDetector.detectHighlights(
        transcription.text,
        transcription.segments,
        data.maxClips,
      );

      // Stage 4: Filter by virality score and assign IDs
      const highlights: IHighlight[] = rawHighlights
        .filter((h) => h.virality_score >= data.minViralityScore)
        .map((h) => ({
          ...h,
          id: randomUUID(),
        }));

      // Stage 5: Save highlights — pipeline complete (no generation)
      await this.updateProject(projectId, {
        highlights,
        progress: 100,
        status: 'analyzed',
      });

      this.logger.log(`${this.logContext} analysis complete`, {
        highlightsCount: highlights.length,
        projectId,
      });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown analysis error';

      this.logger.error(`${this.logContext} analysis failed`, error);

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
    const filesUrl =
      this.configService.get('GENFEEDAI_MICROSERVICES_FILES_URL') ||
      'http://localhost:3012';

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
